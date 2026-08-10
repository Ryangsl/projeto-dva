import { useMemo, useRef, useState } from 'react';
import type { PontoSerie } from '../../services/gestor.service';

// Séries do gráfico. A cor identifica, mas o padrão de traço (dash) dá uma
// segunda pista redundante (acessibilidade / daltonismo) — as cores verde↔laranja
// ficam no piso de separação CVD, então o traço distinto é obrigatório.
const SERIES = [
  { chave: 'acessos', rotulo: 'Acessos', cor: 'var(--serie-acessos)', dash: '' },
  { chave: 'iniciadas', rotulo: 'Fichas iniciadas', cor: 'var(--serie-iniciadas)', dash: '7 4' },
  { chave: 'concluidas', rotulo: 'Fichas concluídas', cor: 'var(--serie-concluidas)', dash: '2 4' },
] as const;

const W = 720;
const H = 260;
const M = { top: 14, right: 14, bottom: 26, left: 34 };
const plotW = W - M.left - M.right;
const plotH = H - M.top - M.bottom;

// Arredonda o topo do eixo Y para um número "redondo" (2/5/10...) para os rótulos
// ficarem legíveis.
function tetoBonito(v: number): number {
  if (v <= 5) return 5;
  const mag = Math.pow(10, Math.floor(Math.log10(v)));
  const norm = v / mag;
  const passo = norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return passo * mag;
}

function rotuloData(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

interface Props {
  serie: PontoSerie[];
}

// Gráfico de evolução do uso (SVG inline, sem biblioteca — requisito de leveza).
// Linha multi-série com eixos, legenda e tooltip no hover.
export function GraficoEvolucao({ serie }: Props) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const n = serie.length;
  const maxY = useMemo(() => {
    const m = Math.max(1, ...serie.flatMap((p) => [p.acessos, p.iniciadas, p.concluidas]));
    return tetoBonito(m);
  }, [serie]);

  const xFor = (i: number) => (n <= 1 ? M.left + plotW / 2 : M.left + (plotW * i) / (n - 1));
  const yFor = (v: number) => M.top + plotH * (1 - v / maxY);

  const linha = (chave: (typeof SERIES)[number]['chave']) =>
    serie.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p[chave]).toFixed(1)}`).join(' ');

  // Índice mais próximo do ponteiro (para crosshair + tooltip).
  function aoMover(e: React.PointerEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || n === 0) return;
    const rel = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((rel - M.left) / plotW) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  }

  // Rótulos de X: no máximo ~7, espaçados, sempre incluindo o último.
  const passoRotulo = Math.max(1, Math.ceil(n / 7));
  const gridY = [0, 0.25, 0.5, 0.75, 1];

  const total = (chave: (typeof SERIES)[number]['chave']) =>
    serie.reduce((s, p) => s + p[chave], 0);

  const pontoHover = hover !== null ? serie[hover] : null;

  return (
    <div className="grafico">
      <div className="grafico-legenda">
        {SERIES.map((s) => (
          <span key={s.chave} className="grafico-legenda-item">
            <svg width="22" height="10" aria-hidden="true">
              <line
                x1="1"
                y1="5"
                x2="21"
                y2="5"
                stroke={s.cor}
                strokeWidth="2.5"
                strokeDasharray={s.dash || undefined}
              />
            </svg>
            {s.rotulo}
            <strong>{total(s.chave)}</strong>
          </span>
        ))}
      </div>

      <div className="grafico-area">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="grafico-svg"
          role="img"
          aria-label="Evolução diária de acessos e fichas"
          onPointerMove={aoMover}
          onPointerLeave={() => setHover(null)}
        >
          {/* Grade + rótulos do eixo Y */}
          {gridY.map((g) => {
            const y = M.top + plotH * g;
            const valor = Math.round(maxY * (1 - g));
            return (
              <g key={g}>
                <line x1={M.left} y1={y} x2={W - M.right} y2={y} className="grafico-grade" />
                <text x={M.left - 6} y={y + 3} className="grafico-eixo-txt" textAnchor="end">
                  {valor}
                </text>
              </g>
            );
          })}

          {/* Rótulos do eixo X */}
          {serie.map((p, i) =>
            i % passoRotulo === 0 || i === n - 1 ? (
              <text
                key={p.dia}
                x={xFor(i)}
                y={H - 8}
                className="grafico-eixo-txt"
                textAnchor="middle"
              >
                {rotuloData(p.dia)}
              </text>
            ) : null,
          )}

          {/* Crosshair no hover */}
          {pontoHover && (
            <line
              x1={xFor(hover!)}
              y1={M.top}
              x2={xFor(hover!)}
              y2={M.top + plotH}
              className="grafico-crosshair"
            />
          )}

          {/* Linhas das séries */}
          {SERIES.map((s) => (
            <path
              key={s.chave}
              d={linha(s.chave)}
              fill="none"
              stroke={s.cor}
              strokeWidth="2"
              strokeDasharray={s.dash || undefined}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}

          {/* Marcadores do ponto em hover */}
          {pontoHover &&
            SERIES.map((s) => (
              <circle
                key={s.chave}
                cx={xFor(hover!)}
                cy={yFor(pontoHover[s.chave])}
                r="3.5"
                fill={s.cor}
                className="grafico-ponto"
              />
            ))}
        </svg>

        {pontoHover && (
          <div
            className="grafico-tooltip"
            style={{
              left: `${(xFor(hover!) / W) * 100}%`,
              // Ancora o tooltip do lado que couber.
              transform: hover! > n / 2 ? 'translate(-100%, 0)' : 'translate(0, 0)',
            }}
          >
            <div className="grafico-tooltip-dia">{rotuloData(pontoHover.dia)}</div>
            {SERIES.map((s) => (
              <div key={s.chave} className="grafico-tooltip-linha">
                <span className="grafico-tooltip-bola" style={{ background: s.cor }} />
                {s.rotulo}
                <strong>{pontoHover[s.chave]}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
