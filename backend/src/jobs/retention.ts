import { purgarAtendimentosAntigos } from '../modules/monitoramento/monitoramento.service.js';

// Política de retenção dos dados de monitoramento: 60 dias. Após isso, os
// registros de atendimento são removidos automaticamente. Isso se refere APENAS
// aos dados armazenados — não afeta a validade da autenticação/sessão.
export const DIAS_RETENCAO = 60;

const INTERVALO_MS = 24 * 60 * 60 * 1000; // roda 1x por dia
const LOTE = 1000; // deleta em lotes para não segurar locks longos

// Executa uma passada de limpeza, deletando em lotes até esgotar os vencidos.
export async function purgarDadosAntigos(): Promise<number> {
  let total = 0;
  for (;;) {
    const removidos = await purgarAtendimentosAntigos(DIAS_RETENCAO, LOTE);
    total += removidos;
    if (removidos < LOTE) break;
  }
  return total;
}

// Agenda a limpeza: uma execução no boot (após pequeno atraso, para não competir
// com a subida) e depois a cada 24h. Escolhido um job in-process (sem scheduler
// externo) por leveza e portabilidade (servidor local/VPS). Alternativa possível:
// um EVENT do MySQL, se o event_scheduler estiver habilitado no servidor.
export function iniciarRetentionJob(): void {
  const executar = () => {
    purgarDadosAntigos()
      .then((n) => {
        if (n > 0) console.log(`✔ Retenção: ${n} atendimento(s) além de ${DIAS_RETENCAO} dias removido(s).`);
      })
      .catch((err) => console.error('✖ Falha no job de retenção:', err));
  };

  setTimeout(executar, 30 * 1000).unref();
  setInterval(executar, INTERVALO_MS).unref();
}
