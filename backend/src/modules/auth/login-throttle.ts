// Proteção simples contra força-bruta no login, em memória (sem dependência
// externa — requisito de leveza). Conta tentativas falhas por chave (e-mail+IP)
// numa janela deslizante; ao exceder o limite, bloqueia por um tempo. Um login
// bem-sucedido zera o contador. Adequado ao porte do app (poucos balcões); para
// múltiplas instâncias, migrar o contador para um store compartilhado.
const JANELA_MS = 15 * 60 * 1000; // tentativas contam dentro de 15 min
const MAX_TENTATIVAS = 10;
const BLOQUEIO_MS = 15 * 60 * 1000; // tempo bloqueado após estourar o limite

interface Registro {
  tentativas: number;
  primeira: number;
  bloqueadoAte: number;
}

const registros = new Map<string, Registro>();

function agora(): number {
  return Date.now();
}

// Retorna os segundos restantes de bloqueio (0 = liberado).
export function segundosBloqueado(chave: string): number {
  const reg = registros.get(chave);
  if (!reg) return 0;
  const restante = reg.bloqueadoAte - agora();
  return restante > 0 ? Math.ceil(restante / 1000) : 0;
}

export function registrarFalha(chave: string): void {
  const t = agora();
  const reg = registros.get(chave);
  if (!reg || t - reg.primeira > JANELA_MS) {
    registros.set(chave, { tentativas: 1, primeira: t, bloqueadoAte: 0 });
    return;
  }
  reg.tentativas += 1;
  if (reg.tentativas >= MAX_TENTATIVAS) {
    reg.bloqueadoAte = t + BLOQUEIO_MS;
  }
}

export function registrarSucesso(chave: string): void {
  registros.delete(chave);
}

// Limpeza oportunista de registros vencidos para o Map não crescer sem limite.
setInterval(
  () => {
    const t = agora();
    for (const [chave, reg] of registros) {
      if (reg.bloqueadoAte < t && t - reg.primeira > JANELA_MS) registros.delete(chave);
    }
  },
  30 * 60 * 1000,
).unref();
