// Logos reais das marcas do Grupo ProCar — arquivos oficiais em
// public/images/ (fornecidos pelo cliente em 2026-08-11), SVG quando
// disponível (melhor qualidade/escalabilidade), PNG nas demais. Casadas pelo
// nome vindo da FIPE (ex.: 'Mercedes-Benz'/'MERCEDES-BENZ' → mercedes) via
// toLowerCase() + includes(), então variação de grafia/prefixo não quebra o
// casamento. Marca sem correspondência cai no selo com a inicial (fallback
// abaixo) — nunca um desenho inventado.
//
// `mono`: arquivo SÓ com preto sólido sobre fundo transparente (confirmado
// pixel a pixel — ver diagnóstico abaixo) — no tema escuro ficaria invisível
// sobre o fundo escuro do card, então recebe o mesmo filtro que já inverte
// a logo PROCAR no tema escuro (--logo-filtro, ver global.css). Só RAM e BYD
// se qualificam: são de fato uma única cor.
//
// Mercedes e Chrysler NÃO são mono, mesmo sendo "pretas" à primeira vista:
// os arquivos têm um disco/losango branco OPACO por trás do desenho (não é
// fundo transparente ali) — confirmado amostrando os pixels dos PNGs
// (Mercedes: ~76% da área opaca é branca, só a estrela/anel é preta;
// Chrysler: ~35% branca, o emblema alado tem uma base branca atrás do
// medalhão). Tratar como "mono" e aplicar brightness(0)+invert(1) funde as
// duas cores numa só (as duas ficam pretas e depois as duas ficam brancas
// juntas) — é exatamente o bug que virou "uma bolha sólida sem detalhe"
// reportado pelo cliente, em qualquer tema. Sem filtro nenhum, o próprio
// branco opaco do arquivo já contrasta com um card escuro sozinho — por
// isso caem no grupo "colorida" (halo sutil, sem inverter), junto com
// Jeep/Denza/Dodge (que são coloridas de verdade e também não podem ser
// invertidas sem destruir a cor da marca).
const ESCURO = '#12283f';

const CHAVES: [trecho: string, arquivo: string, mono: boolean][] = [
  ['mercedes', 'mercedes-benz-seeklogo.png', false],
  ['jeep', 'jeep-seeklogo.png', false],
  ['ram', 'ram-trucks-seeklogo-2.svg', true],
  ['byd', 'byd-seeklogo.svg', true],
  ['dodge', 'dodge-seeklogo.png', false],
  ['chrysler', 'chrysler-seeklogo.png', false],
  ['denza', 'denza-seeklogo.svg', false],
];

function arquivoDaMarca(marca: string): { src: string; mono: boolean } | null {
  const nome = marca.toLowerCase();
  const encontrado = CHAVES.find(([trecho]) => nome.includes(trecho));
  return encontrado ? { src: `/images/${encontrado[1]}`, mono: encontrado[2] } : null;
}

interface BrandLogoProps {
  marca: string;
  size?: number;
  className?: string;
}

export function BrandLogo({ marca, size = 28, className }: BrandLogoProps) {
  const arquivo = arquivoDaMarca(marca);

  if (arquivo) {
    // Caixa FIXA (altura + largura, não `width: auto`) com object-fit:
    // contain — os arquivos têm proporções muito diferentes entre si (de
    // ~1:1 a mais de 7:1), e só uma caixa com os dois eixos travados garante
    // que o contain escale cada um preservando proporção sem depender de
    // regras de resolução de `auto` do navegador (que na prática distorcia
    // as mais largas). A largura da caixa é generosa (2x a altura) pra dar
    // espaço às marcas com lockup horizontal (Dodge, Chrysler).
    return (
      <img
        src={arquivo.src}
        alt=""
        className={`${className ?? ''} ${arquivo.mono ? 'marca-logo-mono' : 'marca-logo-realce'}`}
        style={{ height: size, width: size * 2, objectFit: 'contain', display: 'block' }}
      />
    );
  }

  // Fallback: selo com a inicial da marca (cobertura da FIPE para marcas
  // recentes/nicho é incerta — ver CLAUDE.md).
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={marca}
      style={{ display: 'block' }}
    >
      <circle cx={32} cy={32} r={28} fill={ESCURO} />
      <text
        x={32}
        y={42}
        textAnchor="middle"
        fontFamily="'Arial Black', Arial, sans-serif"
        fontWeight={900}
        fontSize={28}
        fill="#fff"
      >
        {marca.trim().charAt(0).toUpperCase()}
      </text>
    </svg>
  );
}
