import { useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PontoSerie } from '../../services/monitoramento.service';

interface Props {
  pontos: PontoSerie[];
}

const LARGURA = 720;
const ALTURA = 220;
const MARGEM_ESQ = 36;
const MARGEM_BASE = 26;

// Arredonda o teto do eixo Y para um número "redondo" (1, 2, 5, 10, 20, 50...),
// para as linhas de grade não caírem em valores estranhos como "7".
function tetoBonito(valor: number): number {
  if (valor <= 5) return 5;
  const grandeza = 10 ** Math.floor(Math.log10(valor));
  const passo = valor / grandeza <= 2 ? grandeza / 2 : grandeza;
  return Math.ceil(valor / passo) * passo;
}

function formatarDia(iso: string): string {
  const [, mes, dia] = iso.split('-');
  return `${dia}/${mes}`;
}

// Gráfico de barras simples (sem biblioteca — mesma filosofia de leveza já
// usada no projeto para o antigo gráfico de evolução): um único indicador
// (veículos cadastrados por dia), sem depender de codificação por cor.
export function GraficoVeiculosPorDia({ pontos }: Props) {
  const [indiceAtivo, setIndiceAtivo] = useState<number | null>(null);

  const teto = useMemo(() => tetoBonito(Math.max(1, ...pontos.map((p) => p.total))), [pontos]);
  const larguraUtil = LARGURA - MARGEM_ESQ - 8;
  const alturaUtil = ALTURA - MARGEM_BASE - 10;
  const larguraBarra = pontos.length > 0 ? larguraUtil / pontos.length : 0;

  // Rótulos do eixo X: no máximo ~7, para não amontoar em períodos de 60 dias.
  const passoRotulo = Math.max(1, Math.ceil(pontos.length / 7));

  function coordenadas(indice: number) {
    const total = pontos[indice].total;
    const alturaBarra = (total / teto) * alturaUtil;
    const x = MARGEM_ESQ + indice * larguraBarra;
    const y = ALTURA - MARGEM_BASE - alturaBarra;
    return { x, y, alturaBarra };
  }

  function aoMoverPonteiro(e: ReactPointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const xRelativo = ((e.clientX - rect.left) / rect.width) * LARGURA;
    const indice = Math.min(
      pontos.length - 1,
      Math.max(0, Math.floor((xRelativo - MARGEM_ESQ) / larguraBarra)),
    );
    setIndiceAtivo(indice);
  }

  if (pontos.length === 0) {
    return <p className="guia-hint">Sem dados para o período selecionado.</p>;
  }

  const ativo = indiceAtivo !== null ? pontos[indiceAtivo] : null;

  return (
    <div className="grafico-wrap">
      <svg
        className="grafico-svg"
        viewBox={`0 0 ${LARGURA} ${ALTURA}`}
        role="img"
        aria-label={`Veículos cadastrados por dia, de ${formatarDia(pontos[0].dia)} a ${formatarDia(pontos[pontos.length - 1].dia)}`}
        onPointerMove={aoMoverPonteiro}
        onPointerLeave={() => setIndiceAtivo(null)}
      >
        {/* Linhas de grade horizontais (0, metade, teto). */}
        {[0, 0.5, 1].map((f) => {
          const y = ALTURA - MARGEM_BASE - f * alturaUtil;
          return (
            <g key={f}>
              <line x1={MARGEM_ESQ} x2={LARGURA} y1={y} y2={y} className="grafico-grade" />
              <text x={4} y={y + 4} className="grafico-eixo-texto">
                {Math.round(teto * f)}
              </text>
            </g>
          );
        })}

        {pontos.map((p, i) => {
          const { x, y, alturaBarra } = coordenadas(i);
          const ehAtivo = i === indiceAtivo;
          return (
            <g key={p.dia}>
              <rect
                x={x + larguraBarra * 0.15}
                y={y}
                width={Math.max(1, larguraBarra * 0.7)}
                height={Math.max(0, alturaBarra)}
                className={`grafico-barra ${ehAtivo ? 'grafico-barra-ativa' : ''}`}
              />
              {i % passoRotulo === 0 && (
                <text
                  x={x + larguraBarra / 2}
                  y={ALTURA - 6}
                  textAnchor="middle"
                  className="grafico-eixo-texto"
                >
                  {formatarDia(p.dia)}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {ativo && (
        <div className="grafico-legenda">
          <strong>{formatarDia(ativo.dia)}</strong> · {ativo.total} veículo{ativo.total === 1 ? '' : 's'}
        </div>
      )}
    </div>
  );
}
