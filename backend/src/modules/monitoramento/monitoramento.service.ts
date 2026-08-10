import type { ResultSetHeader } from 'mysql2';
import { pool } from '../../config/database.js';

// Metadados NÃO-identificáveis de um atendimento. Por design, nada aqui
// identifica o cliente (sem nome, telefone, CPF, placa, chassi): o objetivo é
// apenas contabilizar o uso da ferramenta pelo consultor.
export interface MetadadosAtendimento {
  marca?: string | null;
  setor?: string | null;
  canal?: 'presencial' | 'telefone' | null;
  categoria?: string | null;
  banco?: 'tecido' | 'couro' | null;
}

// Registra o INÍCIO de um atendimento (idempotente pelo uuid gerado no cliente).
// Se a mesma chamada chegar duas vezes (retry offline), o ON DUPLICATE apenas
// atualiza os metadados, sem duplicar a linha nem regredir um já concluído.
export async function iniciarAtendimento(
  usuarioId: number,
  sessaoId: number | null,
  uuid: string,
  meta: MetadadosAtendimento,
): Promise<void> {
  await pool.query(
    `INSERT INTO atendimentos (uuid, usuario_id, sessao_id, status, marca, setor, canal, categoria, banco)
     VALUES (?, ?, ?, 'iniciado', ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       marca = VALUES(marca), setor = VALUES(setor), canal = VALUES(canal),
       categoria = VALUES(categoria), banco = VALUES(banco)`,
    [
      uuid,
      usuarioId,
      sessaoId,
      meta.marca ?? null,
      meta.setor ?? null,
      meta.canal ?? null,
      meta.categoria ?? null,
      meta.banco ?? null,
    ],
  );
}

// Marca o atendimento como CONCLUÍDO ao gerar o guia. Tolerante a offline: se o
// "iniciar" não chegou (ex.: rede caiu no meio), cria a linha já concluída com o
// mesmo uuid; se chegou, apenas fecha, preservando o iniciado_em original.
export async function concluirAtendimento(
  usuarioId: number,
  sessaoId: number | null,
  uuid: string,
  meta: MetadadosAtendimento,
): Promise<void> {
  await pool.query(
    `INSERT INTO atendimentos (uuid, usuario_id, sessao_id, status, marca, setor, canal, categoria, banco, concluido_em)
     VALUES (?, ?, ?, 'concluido', ?, ?, ?, ?, ?, NOW())
     ON DUPLICATE KEY UPDATE
       status = 'concluido',
       concluido_em = COALESCE(concluido_em, NOW()),
       marca = COALESCE(atendimentos.marca, VALUES(marca)),
       setor = COALESCE(atendimentos.setor, VALUES(setor)),
       canal = COALESCE(atendimentos.canal, VALUES(canal)),
       categoria = COALESCE(atendimentos.categoria, VALUES(categoria)),
       banco = COALESCE(atendimentos.banco, VALUES(banco))`,
    [
      uuid,
      usuarioId,
      sessaoId,
      meta.marca ?? null,
      meta.setor ?? null,
      meta.canal ?? null,
      meta.categoria ?? null,
      meta.banco ?? null,
    ],
  );
}

// Remove atendimentos além da retenção (política: máx. 60 dias). Executado em
// lotes pelo retention job para não segurar locks longos. Retorna quantas linhas
// foram removidas nesta passada.
export async function purgarAtendimentosAntigos(
  diasRetencao: number,
  lote: number,
): Promise<number> {
  // Valores internos (constantes do job), não entrada do usuário — inlinados
  // como inteiros para evitar o tratamento de LIMIT com placeholder no mysql2.
  const dias = Math.max(0, Math.floor(diasRetencao));
  const limite = Math.max(1, Math.floor(lote));
  const [res] = await pool.query<ResultSetHeader>(
    `DELETE FROM atendimentos WHERE iniciado_em < (NOW() - INTERVAL ${dias} DAY) LIMIT ${limite}`,
  );
  return res.affectedRows ?? 0;
}
