import type { NextFunction, Request, Response } from 'express';

// Rate limit em memória, por janela fixa. Mesmo racional do login-throttle.ts:
// sem dependência externa (requisito de leveza, §2 do CLAUDE.md) e adequado ao
// porte do app (poucos balcões, uma instância). Para múltiplas instâncias,
// migrar o contador para um store compartilhado (ver §9 do CLAUDE.md).
//
// ATENÇÃO ao dimensionar: uma concessionária inteira sai pela MESMA saída NAT,
// então vários tablets compartilham o IP público. Os limites abaixo são
// deliberadamente generosos para nunca atrapalhar o uso legítimo — o objetivo
// é barrar automação/varredura, não moldar o tráfego do balcão.

interface Janela {
  contagem: number;
  reiniciaEm: number;
}

export interface OpcoesRateLimit {
  janelaMs: number;
  maximo: number;
  // Identificador do "balde". Default: IP. Rotas autenticadas podem contar por
  // usuário, o que é mais justo atrás de NAT.
  chave?: (req: Request) => string;
  mensagem?: string;
}

export function rateLimit(opcoes: OpcoesRateLimit) {
  const { janelaMs, maximo, mensagem = 'Muitas requisições. Tente novamente em instantes.' } = opcoes;
  const chaveDe = opcoes.chave ?? ((req: Request) => req.ip ?? 'desconhecido');
  const baldes = new Map<string, Janela>();

  // Limpeza periódica para o Map não crescer sem limite.
  setInterval(() => {
    const agora = Date.now();
    for (const [chave, janela] of baldes) {
      if (janela.reiniciaEm <= agora) baldes.delete(chave);
    }
  }, janelaMs).unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    const agora = Date.now();
    const chave = chaveDe(req);
    const janela = baldes.get(chave);

    if (!janela || janela.reiniciaEm <= agora) {
      baldes.set(chave, { contagem: 1, reiniciaEm: agora + janelaMs });
      return next();
    }

    janela.contagem += 1;
    if (janela.contagem > maximo) {
      const segundos = Math.max(1, Math.ceil((janela.reiniciaEm - agora) / 1000));
      res.setHeader('Retry-After', String(segundos));
      res.status(429).json({ error: mensagem });
      return;
    }
    next();
  };
}

// Teto global da API por IP. Alto o bastante para uma loja inteira atrás de um
// NAT (vários tablets + polling de 30 s do monitoramento + heartbeats), baixo o
// bastante para interromper varredura ou repetição automatizada.
export const rateLimitGlobal = rateLimit({
  janelaMs: 60 * 1000,
  maximo: 600,
});

// Operações sensíveis autenticadas (troca de senha, criação/reset de usuário):
// conta por USUÁRIO, não por IP — atrás de NAT, contar por IP puniria a loja
// inteira pelo comportamento de uma conta.
export const rateLimitSensivel = rateLimit({
  janelaMs: 15 * 60 * 1000,
  maximo: 30,
  chave: (req) => (req.user ? `u:${req.user.sub}` : `ip:${req.ip ?? 'desconhecido'}`),
  mensagem: 'Muitas tentativas nesta operação. Aguarde alguns minutos.',
});
