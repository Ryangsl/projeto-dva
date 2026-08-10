import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppHeader } from '../../components/AppHeader';
import { Logo } from '../../components/Logo';
import { BrandLogo } from '../../components/BrandLogo';
import {
  buscarConsultores,
  buscarDashboard,
  type Dashboard,
  type ListaConsultores,
  type OrdenacaoConsultores,
  type PeriodoDias,
  type UsoUsuario,
} from '../../services/gestor.service';
import { GraficoEvolucao } from './GraficoEvolucao';
import './uso.css';

// A tela se atualiza sozinha (polling leve — só esta tela, só o gestor).
const INTERVALO_ATUALIZACAO_MS = 30 * 1000;
const PERIODOS: PeriodoDias[] = [7, 30, 60];
const LIMITE_PAGINA = 8;

const ORDENACOES: { valor: OrdenacaoConsultores; rotulo: string }[] = [
  { valor: 'mais_usam', rotulo: 'Mais usam' },
  { valor: 'sem_uso', rotulo: 'Sem uso recente' },
  { valor: 'nome', rotulo: 'Nome' },
];

function formatarTempo(segundos: number): string {
  if (segundos < 60) return segundos > 0 ? '< 1min' : '—';
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  return horas > 0 ? `${horas}h ${minutos}min` : `${minutos}min`;
}

function formatarDuracao(segundos: number): string {
  if (segundos < 60) return 'menos de 1 min';
  const dias = Math.floor(segundos / 86400);
  if (dias >= 1) return dias === 1 ? '1 dia' : `${dias} dias`;
  const horas = Math.floor(segundos / 3600);
  const minutos = Math.floor((segundos % 3600) / 60);
  if (horas >= 1) return minutos > 0 ? `${horas}h ${minutos}min` : `${horas}h`;
  return `${minutos} min`;
}

function formatarUltimoLogin(data: string | null): string {
  if (!data) return 'Nunca acessou';
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusDoUsuario(u: UsoUsuario): string {
  if (u.online && u.segundos_sessao_atual !== null)
    return `Online há ${formatarDuracao(u.segundos_sessao_atual)}`;
  if (u.segundos_desde_atividade !== null)
    return `Offline há ${formatarDuracao(u.segundos_desde_atividade)}`;
  return 'Nunca acessou';
}

function IdentidadeConsultora({ u, size = 40 }: { u: UsoUsuario; size?: number }) {
  return u.marca ? (
    <BrandLogo marca={u.marca} size={size} />
  ) : (
    <Logo height={size / 2} className="uso-logo-procar" />
  );
}

// Visão do gestor: painel consolidado do uso da ferramenta pelos consultores —
// KPIs, evolução no tempo, rankings e a lista detalhada por concessionária.
export function UsoPage() {
  const { usuario } = useAuth();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [lista, setLista] = useState<ListaConsultores | null>(null);
  const [periodo, setPeriodo] = useState<PeriodoDias>(30);
  const [ordenar, setOrdenar] = useState<OrdenacaoConsultores>('mais_usam');
  const [pagina, setPagina] = useState(1);
  const [erro, setErro] = useState('');

  const carregar = useCallback(
    (silencioso: boolean) => {
      Promise.all([
        buscarDashboard(periodo),
        buscarConsultores({ dias: periodo, ordenar, pagina, limite: LIMITE_PAGINA }),
      ])
        .then(([d, l]) => {
          setDashboard(d);
          setLista(l);
          setErro('');
        })
        .catch(() => {
          // No polling, mantém a última tela; só acusa erro sem dados.
          if (!silencioso) setErro('Não foi possível carregar os dados de uso.');
        });
    },
    [periodo, ordenar, pagina],
  );

  useEffect(() => {
    carregar(false);
    const timer = window.setInterval(() => carregar(true), INTERVALO_ATUALIZACAO_MS);
    return () => window.clearInterval(timer);
  }, [carregar]);

  // Área exclusiva de gestor/admin (o backend também restringe).
  if (usuario && usuario.perfil !== 'gestor' && usuario.perfil !== 'admin')
    return <Navigate to="/guia" replace />;

  const totalPaginas = lista ? Math.max(1, Math.ceil(lista.total / lista.limite)) : 1;
  const taxa = dashboard ? Math.round(dashboard.taxaConclusao * 100) : 0;

  return (
    <div className="guia">
      <AppHeader
        titulo="Monitoramento de Uso"
        acoes={
          <>
            <Link to="/usuarios" className="app-topo-link">
              Usuários
            </Link>
            <Link to="/guia" className="app-topo-link">
              ← Guia
            </Link>
          </>
        }
      />

      {erro && !dashboard && <div className="guia-erro">{erro}</div>}
      {!dashboard && !erro && <div className="guia-carregando">Carregando painel...</div>}

      {dashboard && (
        <div className="dash">
          {/* Seletor de período */}
          <div className="dash-topo">
            <div className="dash-periodo" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button
                  key={p}
                  className={`dash-periodo-btn ${periodo === p ? 'ativo' : ''}`}
                  onClick={() => {
                    setPeriodo(p);
                    setPagina(1);
                  }}
                >
                  {p} dias
                </button>
              ))}
            </div>
          </div>

          {/* KPIs */}
          <div className="dash-kpis">
            <Kpi rotulo="Consultores ativos" valor={dashboard.consultoresAtivos} tom="ok" />
            <Kpi rotulo="Sem uso recente" valor={dashboard.consultoresInativos} tom="alerta" />
            <Kpi rotulo="Online agora" valor={dashboard.onlineAgora} tom="ok" ponto />
            <Kpi rotulo="Acessos hoje" valor={dashboard.acessosHoje} />
            <Kpi rotulo={`Fichas iniciadas (${periodo}d)`} valor={dashboard.fichasIniciadas} />
            <Kpi
              rotulo="Taxa de conclusão"
              valor={`${taxa}%`}
              sub={`${dashboard.fichasConcluidas} de ${dashboard.fichasIniciadas}`}
            />
          </div>

          {/* Evolução no tempo */}
          <section className="dash-card">
            <h2 className="dash-card-titulo">Evolução no período</h2>
            <GraficoEvolucao serie={dashboard.serieDiaria} />
          </section>

          {/* Rankings */}
          <div className="dash-rankings">
            <RankingCard titulo="Quem mais usa" itens={dashboard.maisUsam} tipo="uso" />
            <RankingCard titulo="Sem uso recente" itens={dashboard.semUsoRecente} tipo="ocioso" />
          </div>

          {/* Lista detalhada por consultor */}
          <section className="dash-card">
            <div className="dash-lista-cab">
              <h2 className="dash-card-titulo">Consultores</h2>
              <div className="dash-ordenar" role="group" aria-label="Ordenar">
                {ORDENACOES.map((o) => (
                  <button
                    key={o.valor}
                    className={`dash-chip ${ordenar === o.valor ? 'ativo' : ''}`}
                    onClick={() => {
                      setOrdenar(o.valor);
                      setPagina(1);
                    }}
                  >
                    {o.rotulo}
                  </button>
                ))}
              </div>
            </div>

            <div className="uso-lista">
              {lista?.itens.map((u) => (
                <div key={u.id} className={`uso-item ${u.online ? 'uso-item-online' : ''}`}>
                  <IdentidadeConsultora u={u} />
                  <div className="uso-info">
                    <div className="uso-cab">
                      <span className="uso-nome">{u.nome}</span>
                      <span className={`uso-status ${u.online ? 'uso-status-online' : ''}`}>
                        <span className="uso-status-bola" />
                        {statusDoUsuario(u)}
                      </span>
                    </div>
                    <div className="uso-meta">
                      Último login: {formatarUltimoLogin(u.ultimo_login)} · {u.acessos}{' '}
                      {u.acessos === 1 ? 'acesso' : 'acessos'}
                    </div>
                    <div className="uso-fichas">
                      <span className="uso-ficha-tag">
                        {u.fichas_iniciadas} iniciadas ({periodo}d)
                      </span>
                      <span className="uso-ficha-tag uso-ficha-ok">
                        {u.fichas_concluidas} concluídas
                      </span>
                    </div>
                  </div>
                  <div className="uso-tempo">
                    {formatarTempo(u.segundos_logado)}
                    <small>tempo total</small>
                  </div>
                </div>
              ))}
              {lista && lista.itens.length === 0 && (
                <p className="guia-vazio">Nenhum consultor para exibir.</p>
              )}
            </div>

            {lista && lista.total > lista.limite && (
              <div className="dash-paginacao">
                <button
                  className="dash-chip"
                  disabled={pagina <= 1}
                  onClick={() => setPagina((p) => Math.max(1, p - 1))}
                >
                  ← Anterior
                </button>
                <span className="dash-paginacao-info">
                  Página {pagina} de {totalPaginas}
                </span>
                <button
                  className="dash-chip"
                  disabled={pagina >= totalPaginas}
                  onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
                >
                  Próxima →
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Kpi({
  rotulo,
  valor,
  sub,
  tom,
  ponto,
}: {
  rotulo: string;
  valor: number | string;
  sub?: string;
  tom?: 'ok' | 'alerta';
  ponto?: boolean;
}) {
  return (
    <div className={`kpi ${tom ? `kpi-${tom}` : ''}`}>
      <div className="kpi-rotulo">
        {ponto && <span className="kpi-ponto" />}
        {rotulo}
      </div>
      <div className="kpi-valor">{valor}</div>
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}

function RankingCard({
  titulo,
  itens,
  tipo,
}: {
  titulo: string;
  itens: UsoUsuario[];
  tipo: 'uso' | 'ocioso';
}) {
  return (
    <section className="dash-card">
      <h2 className="dash-card-titulo">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="guia-vazio">Sem dados no período.</p>
      ) : (
        <ol className="ranking">
          {itens.map((u, i) => (
            <li key={u.id} className="ranking-item">
              <span className="ranking-pos">{i + 1}</span>
              <IdentidadeConsultora u={u} size={30} />
              <span className="ranking-nome">{u.nome}</span>
              <span className="ranking-valor">
                {tipo === 'uso'
                  ? `${u.fichas_iniciadas} fichas`
                  : u.segundos_desde_atividade === null
                    ? 'Nunca'
                    : `há ${formatarDuracao(u.segundos_desde_atividade)}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
