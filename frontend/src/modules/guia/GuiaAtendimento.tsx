import { useMemo, useState } from 'react';
import { BrandLogo } from '../../components/BrandLogo';
import { avaliarOportunidades, montarNarrativa, montarRoteiro, personalizar } from './guia.engine';
import type { Atendimento, GuiaDados, Servico } from './guia.types';

interface Props {
  dados: GuiaDados;
  atendimento: Atendimento;
  onNovo: () => void;
}

// Segunda tela: o guia gerado para o cliente. Conteúdo principal: seleção de
// serviços + Resumo Inteligente (narrativa única, ver guia.engine.ts). O
// Roteiro completo do Manual de Vendas e o material de apoio (objeções/dicas)
// ficam em blocos recolhíveis ao final, para consulta detalhada quando
// necessário. Nada é persistido; ao concluir, o consultor inicia um novo
// atendimento.
export function GuiaAtendimento({ dados, atendimento, onNovo }: Props) {
  const roteiro = useMemo(() => montarRoteiro(dados.roteiro, atendimento), [dados, atendimento]);
  // Resumo Inteligente: as mesmas etapas do roteiro, filtradas e
  // personalizadas, em forma de narrativa contínua (sem números/títulos).
  const narrativaBase = useMemo(() => montarNarrativa(roteiro), [roteiro]);
  const oportunidades = useMemo(
    () => avaliarOportunidades(dados, atendimento),
    [dados, atendimento],
  );
  // Material de apoio do Manual de Vendas, personalizado para o atendimento.
  // (`?? []` tolera cache antigo, gravado antes das objeções existirem.)
  const apoio = useMemo(
    () =>
      (dados.objecoes ?? []).map((o) => ({
        ...o,
        titulo: personalizar(o.titulo, atendimento),
        resposta: personalizar(o.resposta, atendimento),
      })),
    [dados, atendimento],
  );
  const dicas = apoio.filter((o) => o.tipo === 'dica');
  const objecoes = apoio.filter((o) => o.tipo === 'objecao');

  // Serviços recomendados para este atendimento (regras casadas — ver guia.engine).
  const oportunidadesPorServico = useMemo(
    () => new Map(oportunidades.map((o) => [o.servico.id, o])),
    [oportunidades],
  );
  // Todos os serviços do guia, recomendados primeiro (sort é estável: o
  // restante mantém a ordem vinda do backend — `ordem`/nome).
  const servicosOrdenados = useMemo(
    () =>
      [...dados.servicos].sort((a, b) => {
        const aRec = oportunidadesPorServico.has(a.id) ? 1 : 0;
        const bRec = oportunidadesPorServico.has(b.id) ? 1 : 0;
        return bRec - aRec;
      }),
    [dados.servicos, oportunidadesPorServico],
  );
  // Seleção inicial: o serviço mais recomendado (maior prioridade) ou, na
  // ausência de recomendação, o primeiro serviço do guia.
  const [servicoSelecionadoId, setServicoSelecionadoId] = useState<number | null>(
    () => oportunidades[0]?.servico.id ?? dados.servicos[0]?.id ?? null,
  );

  const banco =
    atendimento.banco === 'couro' ? `Couro ${atendimento.corBanco ?? ''}`.trim() : 'Tecido';

  // "Salvar em PDF" usa o diálogo nativo de impressão do navegador (destino
  // "Salvar como PDF" no tablet/celular/desktop): zero dependências e o
  // arquivo fica só no dispositivo — nada é enviado ao servidor/banco.
  // Antes de imprimir, abre TODOS os blocos recolhíveis da tela (objeções,
  // dicas, roteiro completo, conteúdo original de cada serviço) e nomeia o
  // arquivo com cliente + modelo; tudo é restaurado ao fechar o diálogo.
  function salvarPdf() {
    const detalhes = Array.from(document.querySelectorAll<HTMLDetailsElement>('.guia details'));
    const abertos = detalhes.map((d) => d.open);
    detalhes.forEach((d) => (d.open = true));

    const tituloOriginal = document.title;
    const partes = ['Atendimento', atendimento.cliente.trim(), atendimento.modelo?.nome].filter(
      Boolean,
    );
    document.title = partes.join(' - ');

    window.addEventListener(
      'afterprint',
      () => {
        detalhes.forEach((d, i) => (d.open = abertos[i]));
        document.title = tituloOriginal;
      },
      { once: true },
    );
    window.print();
  }

  return (
    <div className="guia-resultado">
      {/* Cabeçalho do atendimento: cliente + veículo selecionado. */}
      <div className="atendimento-capa-wrap">
      <section className="atendimento-capa">
        {atendimento.fabricante && (
          <BrandLogo marca={atendimento.fabricante.nome} size={56} className="atendimento-logo" />
        )}
        <div className="atendimento-info">
          <span className="atendimento-rotulo">Atendimento de</span>
          <h1 className="atendimento-cliente">{atendimento.cliente.trim()}</h1>
          <div className="atendimento-veiculo">
            <span>{atendimento.modelo?.nome}</span>
            {atendimento.cor && (
              <span className="atendimento-tag">
                <span className="cor-bola cor-bola-mini" style={{ background: atendimento.cor.hex }} />
                {atendimento.cor.nome}
              </span>
            )}
            <span className="atendimento-tag">Bancos: {banco}</span>
            {atendimento.setor && <span className="atendimento-tag">Setor: {atendimento.setor}</span>}
            {atendimento.canal && (
              <span className="atendimento-tag">
                {atendimento.canal === 'presencial' ? 'Presencial' : 'Telefone'}
              </span>
            )}
          </div>
        </div>
        <div className="atendimento-acoes">
          <button className="btn btn-secundario btn-novo" onClick={salvarPdf}>
            Salvar em PDF
          </button>
          <button className="btn btn-secundario btn-novo" onClick={onNovo}>
            + Novo atendimento
          </button>
        </div>
      </section>
      </div>

      {/* Conteúdo principal: seleção de serviços + Resumo Inteligente do
          serviço em foco (ver CLAUDE.md §4 — Resumo Inteligente). */}
      <section className="guia-conteudo">
        <div className="guia-bloco">
          <h2 className="guia-col-titulo">O que ofertar</h2>
          <p className="guia-hint">
            {oportunidades.length > 0
              ? 'Os serviços com ★ são os mais indicados para este atendimento. Toque em um para ver o resumo inteligente.'
              : 'Nenhum serviço com regra específica para esta combinação — veja os detalhes de cada um abaixo.'}
          </p>

          <div className="servicos-seletor">
            {servicosOrdenados.map((s) => {
              const recomendado = oportunidadesPorServico.has(s.id);
              const ativo = s.id === servicoSelecionadoId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={ativo}
                  className={
                    'servico-chip' +
                    (recomendado ? ' servico-chip-recomendado' : '') +
                    (ativo ? ' servico-chip-ativo' : '')
                  }
                  onClick={() => setServicoSelecionadoId(s.id)}
                >
                  {recomendado && <span className="servico-chip-selo">★ Recomendado</span>}
                  <span className="servico-chip-nome">{s.nome}</span>
                </button>
              );
            })}
          </div>

          {/* Detalhe de cada serviço fica sempre no DOM (só o selecionado é
              visível em tela) para que "Salvar em PDF" imprima todos eles. */}
          <div className="servicos-detalhes">
            {servicosOrdenados.map((s) => {
              const recomendado = oportunidadesPorServico.has(s.id);
              const oportunidade = oportunidadesPorServico.get(s.id);
              const ativo = s.id === servicoSelecionadoId;
              return (
                <ServicoDetalhe
                  key={s.id}
                  servico={s}
                  ativo={ativo}
                  recomendado={recomendado}
                  narrativaBase={narrativaBase}
                  argumento={oportunidade?.argumento}
                />
              );
            })}
          </div>
        </div>
      </section>

      {/* Material de apoio do Manual de Vendas: contorno de objeções, dicas
          de ouro e o roteiro completo original, em blocos recolhíveis para
          não poluir o guia — consultados quando o consultor precisa de mais
          detalhe do que o Resumo Inteligente traz. */}
      {(objecoes.length > 0 || dicas.length > 0 || roteiro.length > 0) && (
        <section className="guia-apoio">
          {objecoes.length > 0 && (
            <details className="apoio-bloco">
              <summary className="apoio-titulo">Contorno de objeções</summary>
              <div className="apoio-lista">
                {objecoes.map((o) => (
                  <div key={o.id} className="apoio-item">
                    <div className="apoio-item-titulo">{o.titulo}</div>
                    <div className="apoio-item-texto">{o.resposta}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {dicas.length > 0 && (
            <details className="apoio-bloco">
              <summary className="apoio-titulo">Dicas de ouro</summary>
              <div className="apoio-lista">
                {dicas.map((o) => (
                  <div key={o.id} className="apoio-item">
                    <div className="apoio-item-titulo">{o.titulo}</div>
                    <div className="apoio-item-texto">{o.resposta}</div>
                  </div>
                ))}
              </div>
            </details>
          )}
          {roteiro.length > 0 && (
            <details className="apoio-bloco">
              <summary className="apoio-titulo">Roteiro de atendimento (original do manual)</summary>
              <ol className="roteiro">
                {roteiro.map((etapa, i) => (
                  <li key={etapa.id} className="roteiro-etapa">
                    <span className="roteiro-num">{i + 1}</span>
                    <div className="roteiro-corpo">
                      <div className="roteiro-titulo">{etapa.titulo}</div>
                      <div className="roteiro-instrucao">{etapa.instrucao}</div>
                      <div className="roteiro-frase">"{etapa.frase}"</div>
                    </div>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </section>
      )}

      <div className="guia-rodape">
        <button className="btn btn-secundario btn-pdf-rodape" onClick={salvarPdf}>
          Salvar em PDF
        </button>
        <button className="btn btn-primario btn-novo-rodape" onClick={onNovo}>
          Concluir e iniciar novo atendimento
        </button>
      </div>
    </div>
  );
}

interface ServicoDetalheProps {
  servico: Servico;
  ativo: boolean;
  recomendado: boolean;
  narrativaBase: string[];
  argumento: string | undefined;
}

// Conteúdo de um serviço: o Resumo Inteligente (narrativa contínua — a base
// do roteiro personalizado + o argumento deste serviço como fechamento,
// quando há uma regra casada) e, abaixo, o conteúdo ORIGINAL do Manual de
// Vendas preservado por completo (descrição/preço/garantia + argumento de
// venda), em um bloco recolhível — mesmo padrão de "Contorno de
// objeções"/"Dicas de ouro".
function ServicoDetalhe({ servico, ativo, recomendado, narrativaBase, argumento }: ServicoDetalheProps) {
  const paragrafos = argumento ? [...narrativaBase, argumento] : narrativaBase;

  return (
    <article
      className={
        'servico-detalhe' +
        (ativo ? ' servico-detalhe-ativo' : '') +
        (recomendado ? ' servico-detalhe-recomendado' : '')
      }
    >
      <div className="resumo-inteligente">
        <div className="resumo-inteligente-cab">
          <h3 className="resumo-inteligente-nome">{servico.nome}</h3>
          {servico.selo && <span className="oferta-selo">{servico.selo}</span>}
          {recomendado && <span className="resumo-inteligente-selo">★ Recomendado</span>}
        </div>

        {paragrafos.length > 0 ? (
          <div className="resumo-inteligente-texto">
            {paragrafos.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        ) : (
          <p className="guia-vazio">Nenhum roteiro cadastrado para esta combinação.</p>
        )}
      </div>

      {(servico.descricao || argumento) && (
        <details className="apoio-bloco servico-original">
          <summary className="apoio-titulo">Conteúdo original do manual</summary>
          <div className="apoio-lista">
            {servico.descricao && (
              <div className="apoio-item">
                <div className="apoio-item-titulo">Descrição, preço e garantia</div>
                <div className="apoio-item-texto">{servico.descricao}</div>
              </div>
            )}
            {argumento && (
              <div className="apoio-item">
                <div className="apoio-item-titulo">Argumento de venda</div>
                <div className="apoio-item-texto">"{argumento}"</div>
              </div>
            )}
          </div>
        </details>
      )}
    </article>
  );
}
