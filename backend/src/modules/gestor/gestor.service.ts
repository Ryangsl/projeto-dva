import type { RowDataPacket } from 'mysql2';
import { pool } from '../../config/database.js';

// Heartbeat do front chega a cada 5 min de atividade; com 1 min de margem,
// quem não "bate" há mais que isso é considerado offline.
const ONLINE_LIMIAR_SEGUNDOS = 6 * 60;
// "Ativo" no dashboard = houve login ou atendimento nos últimos 7 dias
// (independente do período selecionado para os demais indicadores).
const ATIVO_DIAS = 7;

// ---------------------------------------------------------------------------
// Uso por usuário/concessionária (visão detalhada — base da lista de consultores)
// ---------------------------------------------------------------------------

export interface UsoUsuario {
  id: number;
  nome: string;
  email: string;
  marca: string | null;
  ultimo_login: string | null;
  acessos: number;
  segundos_logado: number;
  fichas_iniciadas: number;
  fichas_concluidas: number;
  online: boolean;
  // Idade da sessão mais recente (para "Online há X") e do último sinal de
  // atividade (para "Offline há Y"). Calculadas no servidor para não depender
  // do relógio/fuso do cliente. null = nunca acessou.
  segundos_sessao_atual: number | null;
  segundos_desde_atividade: number | null;
}

// Metadados de paginação/ordenção da lista de consultores.
export type OrdenacaoConsultores = 'mais_usam' | 'sem_uso' | 'nome';

export interface ListaConsultores {
  itens: UsoUsuario[];
  total: number;
  pagina: number;
  limite: number;
}

// Escopo de lojas do chamador: `null` = sem restrição (Admin vê tudo); array =
// só as lojas administradas (Gestor). Espelha o modelo já aplicado no módulo
// `usuarios` — um Gestor não deve enxergar os consultores de outras lojas.
export type EscopoMarcas = string[] | null;

// Busca os consultores ativos com suas métricas de uso agregadas. Usa
// subconsultas por usuário (em vez de JOINs) para evitar fan-out cartesiano
// entre `sessoes` e `atendimentos`, que inflaria as somas/contagens.
async function buscarUsoConsultores(dias: number, marcas: EscopoMarcas): Promise<UsoUsuario[]> {
  // Gestor sem nenhuma loja associada não enxerga consultor algum (em vez de
  // cair no `IN ()`, que é erro de sintaxe no MySQL).
  if (marcas && marcas.length === 0) return [];
  const filtroMarca = marcas ? 'AND u.marca IN (?)' : '';
  const params: unknown[] = marcas ? [dias, dias, marcas] : [dias, dias];

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT u.id, u.nome, u.email, u.marca, u.ultimo_login,
       (SELECT COUNT(*) FROM sessoes s WHERE s.usuario_id = u.id) AS acessos,
       (SELECT COALESCE(SUM(TIMESTAMPDIFF(SECOND, s.inicio, s.ultimo_visto)), 0)
        FROM sessoes s WHERE s.usuario_id = u.id) AS segundos_logado,
       (SELECT COUNT(*) FROM atendimentos a
        WHERE a.usuario_id = u.id AND a.iniciado_em >= (NOW() - INTERVAL ? DAY)) AS fichas_iniciadas,
       (SELECT COUNT(*) FROM atendimentos a
        WHERE a.usuario_id = u.id AND a.status = 'concluido'
          AND a.concluido_em >= (NOW() - INTERVAL ? DAY)) AS fichas_concluidas,
       (SELECT TIMESTAMPDIFF(SECOND, s.inicio, NOW())
        FROM sessoes s WHERE s.usuario_id = u.id ORDER BY s.id DESC LIMIT 1) AS segundos_sessao_atual,
       (SELECT TIMESTAMPDIFF(SECOND, MAX(s.ultimo_visto), NOW())
        FROM sessoes s WHERE s.usuario_id = u.id) AS segundos_desde_atividade
     FROM usuarios u
     WHERE u.ativo = 1 AND u.perfil = 'consultor' ${filtroMarca}`,
    params,
  );

  return (rows as RowDataPacket[]).map((r) => {
    const desde = r.segundos_desde_atividade === null ? null : Number(r.segundos_desde_atividade);
    return {
      id: Number(r.id),
      nome: r.nome,
      email: r.email,
      marca: r.marca,
      ultimo_login: r.ultimo_login,
      acessos: Number(r.acessos),
      segundos_logado: Number(r.segundos_logado),
      fichas_iniciadas: Number(r.fichas_iniciadas),
      fichas_concluidas: Number(r.fichas_concluidas),
      online: desde !== null && desde <= ONLINE_LIMIAR_SEGUNDOS,
      segundos_sessao_atual:
        r.segundos_sessao_atual === null ? null : Number(r.segundos_sessao_atual),
      segundos_desde_atividade: desde,
    };
  });
}

// Ordena conforme a intenção do gestor: quem mais usa, quem está sem uso
// recente, ou alfabético.
function ordenar(itens: UsoUsuario[], ordem: OrdenacaoConsultores): UsoUsuario[] {
  const infinito = Number.POSITIVE_INFINITY;
  const copia = [...itens];
  if (ordem === 'mais_usam') {
    copia.sort(
      (a, b) =>
        b.fichas_iniciadas - a.fichas_iniciadas ||
        b.segundos_logado - a.segundos_logado ||
        a.nome.localeCompare(b.nome),
    );
  } else if (ordem === 'sem_uso') {
    // Nunca acessou (null) primeiro, depois maior tempo desde a última atividade.
    copia.sort(
      (a, b) =>
        (b.segundos_desde_atividade ?? infinito) - (a.segundos_desde_atividade ?? infinito) ||
        a.nome.localeCompare(b.nome),
    );
  } else {
    copia.sort((a, b) => a.nome.localeCompare(b.nome));
  }
  return copia;
}

// Lista paginada de consultores para a tabela do dashboard. O número de
// consultores é naturalmente pequeno (~1 por concessionária), então buscamos o
// conjunto e paginamos/ordenamos em memória — simples e seguro (sem ORDER BY
// dinâmico em SQL). Se a base crescer muito, empurrar LIMIT/OFFSET para o SQL.
export async function obterConsultores(opts: {
  dias: number;
  ordenar: OrdenacaoConsultores;
  pagina: number;
  limite: number;
  marcas: EscopoMarcas;
}): Promise<ListaConsultores> {
  const todos = ordenar(await buscarUsoConsultores(opts.dias, opts.marcas), opts.ordenar);
  const inicio = (opts.pagina - 1) * opts.limite;
  return {
    itens: todos.slice(inicio, inicio + opts.limite),
    total: todos.length,
    pagina: opts.pagina,
    limite: opts.limite,
  };
}

// Compat.: lista completa ordenada (online primeiro) — mantém o contrato antigo
// de GET /gestor/uso para consumidores que não usam paginação.
export async function obterUso(marcas: EscopoMarcas): Promise<UsoUsuario[]> {
  const itens = await buscarUsoConsultores(30, marcas);
  return itens.sort(
    (a, b) =>
      Number(b.online) - Number(a.online) ||
      (a.segundos_desde_atividade ?? Number.POSITIVE_INFINITY) -
        (b.segundos_desde_atividade ?? Number.POSITIVE_INFINITY) ||
      a.nome.localeCompare(b.nome),
  );
}

// ---------------------------------------------------------------------------
// Dashboard: KPIs + série temporal (evolução do uso)
// ---------------------------------------------------------------------------

export interface PontoSerie {
  dia: string; // 'YYYY-MM-DD'
  acessos: number;
  iniciadas: number;
  concluidas: number;
}

export interface Dashboard {
  periodoDias: number;
  consultoresAtivos: number;
  consultoresInativos: number;
  onlineAgora: number;
  acessosHoje: number;
  acessosPeriodo: number;
  fichasIniciadas: number;
  fichasConcluidas: number;
  taxaConclusao: number; // 0..1
  serieDiaria: PontoSerie[];
  // Rankings prontos para o painel.
  maisUsam: UsoUsuario[];
  semUsoRecente: UsoUsuario[];
}

// Formata a data em 'YYYY-MM-DD' no fuso LOCAL (não UTC) — precisa casar com o
// DATE() do MySQL, que usa o fuso do servidor (Node e MySQL no mesmo host).
function diaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

// Preenche a série com todos os dias do período (inclusive os sem eventos),
// mapeando as contagens agrupadas por data vindas do banco.
function montarSerie(
  dias: number,
  acessos: Map<string, number>,
  iniciadas: Map<string, number>,
  concluidas: Map<string, number>,
): PontoSerie[] {
  const serie: PontoSerie[] = [];
  const hoje = new Date();
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(hoje);
    d.setDate(hoje.getDate() - i);
    const dia = diaLocal(d);
    serie.push({
      dia,
      acessos: acessos.get(dia) ?? 0,
      iniciadas: iniciadas.get(dia) ?? 0,
      concluidas: concluidas.get(dia) ?? 0,
    });
  }
  return serie;
}

async function serieAgrupada(sql: string, params: unknown[]): Promise<Map<string, number>> {
  const [rows] = await pool.query<RowDataPacket[]>(sql, params);
  const mapa = new Map<string, number>();
  for (const r of rows as RowDataPacket[]) {
    // dateStrings: true → DATE volta como 'YYYY-MM-DD'.
    mapa.set(String(r.dia), Number(r.total));
  }
  return mapa;
}

// Restringe uma agregação de `sessoes`/`atendimentos` (que não têm coluna de
// marca própria) às lojas do escopo, via o dono do registro. `null` = sem
// restrição (Admin). O alias da tabela varia por consulta, daí o parâmetro.
function filtroDono(alias: string, marcas: EscopoMarcas): string {
  return marcas
    ? `AND EXISTS (SELECT 1 FROM usuarios du WHERE du.id = ${alias}.usuario_id AND du.marca IN (?))`
    : '';
}

export async function obterDashboard(dias: number, marcas: EscopoMarcas): Promise<Dashboard> {
  // Gestor sem loja associada não tem base alguma para agregar.
  if (marcas && marcas.length === 0) {
    return {
      periodoDias: dias,
      consultoresAtivos: 0,
      consultoresInativos: 0,
      onlineAgora: 0,
      acessosHoje: 0,
      acessosPeriodo: 0,
      fichasIniciadas: 0,
      fichasConcluidas: 0,
      taxaConclusao: 0,
      serieDiaria: montarSerie(dias, new Map(), new Map(), new Map()),
      maisUsam: [],
      semUsoRecente: [],
    };
  }

  // Cada subconsulta abaixo repete o filtro de lojas, então o array de
  // parâmetros intercala período e marcas na mesma ordem dos placeholders.
  const p = (valor: unknown): unknown[] => (marcas ? [valor, marcas] : [valor]);

  // KPIs de contagem numa única ida ao banco.
  const [[kpis]] = await pool.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM sessoes s
         WHERE DATE(s.inicio) = CURDATE() ${filtroDono('s', marcas)}) AS acessos_hoje,
       (SELECT COUNT(*) FROM sessoes s
         WHERE s.inicio >= (NOW() - INTERVAL ? DAY) ${filtroDono('s', marcas)}) AS acessos_periodo,
       (SELECT COUNT(*) FROM atendimentos a
         WHERE a.iniciado_em >= (NOW() - INTERVAL ? DAY) ${filtroDono('a', marcas)}) AS fichas_iniciadas,
       (SELECT COUNT(*) FROM atendimentos a
         WHERE a.status = 'concluido'
           AND a.concluido_em >= (NOW() - INTERVAL ? DAY) ${filtroDono('a', marcas)}) AS fichas_concluidas`,
    [...(marcas ? [marcas] : []), ...p(dias), ...p(dias), ...p(dias)],
  );

  // Contagem de consultores ativos/inativos/online (sobre TODA a base do
  // escopo, não a página).
  const filtroMarcaUsuario = marcas ? 'AND u.marca IN (?)' : '';
  const [[cont]] = await pool.query<RowDataPacket[]>(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(ativo_recente), 0) AS ativos,
       COALESCE(SUM(online_agora), 0) AS online
     FROM (
       SELECT
         (EXISTS(SELECT 1 FROM sessoes s WHERE s.usuario_id = u.id AND s.inicio >= (NOW() - INTERVAL ? DAY))
          OR EXISTS(SELECT 1 FROM atendimentos a WHERE a.usuario_id = u.id AND a.iniciado_em >= (NOW() - INTERVAL ? DAY))) AS ativo_recente,
         ((SELECT TIMESTAMPDIFF(SECOND, MAX(s.ultimo_visto), NOW()) FROM sessoes s WHERE s.usuario_id = u.id) <= ?) AS online_agora
       FROM usuarios u
       WHERE u.ativo = 1 AND u.perfil = 'consultor' ${filtroMarcaUsuario}
     ) t`,
    marcas
      ? [ATIVO_DIAS, ATIVO_DIAS, ONLINE_LIMIAR_SEGUNDOS, marcas]
      : [ATIVO_DIAS, ATIVO_DIAS, ONLINE_LIMIAR_SEGUNDOS],
  );

  // Séries diárias (uma consulta por métrica; ≤60 linhas cada, preenchidas em JS).
  const [acessos, iniciadas, concluidas] = await Promise.all([
    serieAgrupada(
      `SELECT DATE(s.inicio) AS dia, COUNT(*) AS total FROM sessoes s
       WHERE s.inicio >= (CURDATE() - INTERVAL ? DAY) ${filtroDono('s', marcas)}
       GROUP BY DATE(s.inicio)`,
      p(dias - 1),
    ),
    serieAgrupada(
      `SELECT DATE(a.iniciado_em) AS dia, COUNT(*) AS total FROM atendimentos a
       WHERE a.iniciado_em >= (CURDATE() - INTERVAL ? DAY) ${filtroDono('a', marcas)}
       GROUP BY DATE(a.iniciado_em)`,
      p(dias - 1),
    ),
    serieAgrupada(
      `SELECT DATE(a.concluido_em) AS dia, COUNT(*) AS total FROM atendimentos a
       WHERE a.concluido_em >= (CURDATE() - INTERVAL ? DAY) ${filtroDono('a', marcas)}
       GROUP BY DATE(a.concluido_em)`,
      p(dias - 1),
    ),
  ]);

  // Rankings a partir da mesma base de consultores.
  const consultores = await buscarUsoConsultores(dias, marcas);
  const maisUsam = ordenar(consultores, 'mais_usam')
    .filter((c) => c.fichas_iniciadas > 0 || c.segundos_logado > 0)
    .slice(0, 5);
  const semUsoRecente = ordenar(consultores, 'sem_uso').slice(0, 5);

  const total = Number(cont.total);
  const ativos = Number(cont.ativos);
  const fichasIniciadas = Number(kpis.fichas_iniciadas);
  const fichasConcluidas = Number(kpis.fichas_concluidas);

  return {
    periodoDias: dias,
    consultoresAtivos: ativos,
    consultoresInativos: total - ativos,
    onlineAgora: Number(cont.online),
    acessosHoje: Number(kpis.acessos_hoje),
    acessosPeriodo: Number(kpis.acessos_periodo),
    fichasIniciadas,
    fichasConcluidas,
    taxaConclusao: fichasIniciadas > 0 ? fichasConcluidas / fichasIniciadas : 0,
    serieDiaria: montarSerie(dias, acessos, iniciadas, concluidas),
    maisUsam,
    semUsoRecente,
  };
}
