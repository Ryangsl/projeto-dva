import type { Atendimento, GuiaDados, Oportunidade, RoteiroEtapa } from './guia.types';

// Substitui os placeholders dos templates pelos dados do atendimento atual:
// {cliente} (alias {nome}), {modelo}, {fabricante}, {cor}, {banco}, {cor_banco},
// {setor} e {argumento_cor} (argumento de venda da cor, do Manual de Vendas).
export function personalizar(template: string, atendimento: Atendimento): string {
  const cliente = atendimento.cliente.trim() || 'cliente';
  const banco =
    atendimento.banco === 'couro'
      ? `couro${atendimento.corBanco ? ` ${atendimento.corBanco.toLowerCase()}` : ''}`
      : 'tecido';
  return (
    template
      // Primeiro: o argumento da cor pode conter {cliente}/{cor}, que são
      // resolvidos pelas substituições seguintes.
      .replaceAll('{argumento_cor}', atendimento.cor?.argumento ?? '')
      .replaceAll('{cliente}', cliente)
      .replaceAll('{nome}', cliente)
      .replaceAll('{modelo}', atendimento.modelo?.nome ?? 'carro')
      .replaceAll('{fabricante}', atendimento.fabricante?.nome ?? '')
      .replaceAll('{cor}', atendimento.cor?.nome.toLowerCase() ?? 'dessa cor')
      .replaceAll('{banco}', banco)
      .replaceAll('{cor_banco}', atendimento.corBanco?.toLowerCase() ?? '')
      .replaceAll('{setor}', atendimento.setor ?? '')
  );
}

// Roteiro do atendimento: filtra as etapas pelo setor/canal/banco selecionados
// (campos nulos na etapa = vale para qualquer atendimento) e personaliza
// instrução e frase. A etapa "Argumento pela cor" só entra se a cor tiver
// argumento cadastrado.
export function montarRoteiro(
  roteiro: RoteiroEtapa[],
  atendimento: Atendimento,
): (RoteiroEtapa & { frase: string })[] {
  return roteiro
    .filter((etapa) => {
      // `!campo` (e não `=== null`) para tolerar caches antigos sem os campos.
      const casaSetor = !etapa.setor || etapa.setor === atendimento.setor;
      const casaCanal = !etapa.canal || etapa.canal === atendimento.canal;
      const casaBanco = !etapa.banco || etapa.banco === atendimento.banco;
      const temConteudo =
        !etapa.frase_template.includes('{argumento_cor}') || Boolean(atendimento.cor?.argumento);
      return casaSetor && casaCanal && casaBanco && temConteudo;
    })
    .map((etapa) => ({
      ...etapa,
      instrucao: personalizar(etapa.instrucao, atendimento),
      frase: personalizar(etapa.frase_template, atendimento),
    }));
}

// Título da etapa genérica de fechamento do roteiro: no texto original ela
// manda o consultor "conferir o valor nas oportunidades ao lado", referência
// a um layout em colunas que não existe mais (guia reorganizado em Resumo
// Inteligente). No Resumo Inteligente essa etapa é substituída pelo
// argumento do serviço selecionado (que já traz o valor real) — ver
// `montarNarrativa`. No Roteiro completo (accordion, texto fiel ao Manual de
// Vendas) ela permanece intacta.
const ETAPA_FECHAMENTO_GENERICO = 'Valor e formas de pagamento';

// Resumo Inteligente: reaproveita as MESMAS etapas do roteiro (já filtradas
// por setor/canal/banco e personalizadas por `montarRoteiro`) como uma
// narrativa contínua — um parágrafo por etapa, sem números/títulos — em vez
// de uma lista de passos. Não reescreve nada do Manual de Vendas, só muda a
// apresentação. Quem chama esta função decide se acrescenta o argumento do
// serviço selecionado como parágrafo de fechamento (ver GuiaAtendimento.tsx).
export function montarNarrativa(roteiro: (RoteiroEtapa & { frase: string })[]): string[] {
  return roteiro.filter((etapa) => etapa.titulo !== ETAPA_FECHAMENTO_GENERICO).map((e) => e.frase);
}

// Avalia as regras no cliente (sem rede) e devolve as oportunidades a ofertar.
// Uma regra casa quando cor/categoria/modelo/banco/setor batem (campos nulos =
// "qualquer"). Se mais de uma regra apontar o mesmo serviço, vence a de maior
// prioridade.
export function avaliarOportunidades(dados: GuiaDados, atendimento: Atendimento): Oportunidade[] {
  const { modelo, cor, banco, setor } = atendimento;
  if (!modelo) return [];

  const servicosPorId = new Map(dados.servicos.map((s) => [s.id, s]));
  const melhorPorServico = new Map<number, { prioridade: number; argumento: string }>();

  for (const regra of dados.regras) {
    const casaCor = regra.cor === null || regra.cor === cor?.nome;
    const casaCategoria = regra.categoria === null || regra.categoria === modelo.categoria;
    const casaModelo = regra.modelo_id === null || regra.modelo_id === modelo.id;
    const casaBanco = regra.banco === null || regra.banco === banco;
    // `!regra.setor` para tolerar caches antigos sem o campo.
    const casaSetor = !regra.setor || regra.setor === setor;
    if (!casaCor || !casaCategoria || !casaModelo || !casaBanco || !casaSetor) continue;

    const atual = melhorPorServico.get(regra.servico_id);
    if (!atual || regra.prioridade > atual.prioridade) {
      melhorPorServico.set(regra.servico_id, {
        prioridade: regra.prioridade,
        argumento: personalizar(regra.argumento_template, atendimento),
      });
    }
  }

  return [...melhorPorServico.entries()]
    .map(([servicoId, { prioridade, argumento }]) => ({
      servico: servicosPorId.get(servicoId)!,
      argumento,
      prioridade,
    }))
    .filter((o) => o.servico)
    .sort((a, b) => b.prioridade - a.prioridade)
    .map(({ servico, argumento }) => ({ servico, argumento }));
}
