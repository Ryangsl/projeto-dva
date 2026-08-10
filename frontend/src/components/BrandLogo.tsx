import { BRAND_ICONS } from './brand-paths';

// Logos reais das marcas em SVG inline (paths oficiais do Simple Icons,
// embutidos em build — leve e offline, sem imagem externa/CDN). Casadas pelo
// nome vindo da FIPE (ex.: 'VW - VolksWagen' → volkswagen, 'GM - Chevrolet' →
// chevrolet). Marcas sem desenho caem no selo com a inicial.

const ESCURO = '#12283f';

// Casamento por trecho do nome (nomes FIPE têm prefixos/variações).
const CHAVES: [trecho: string, slug: string][] = [
  ['volkswagen', 'volkswagen'],
  ['vw', 'volkswagen'],
  ['bmw', 'bmw'],
  ['mercedes', 'mercedes'],
  ['audi', 'audi'],
  ['toyota', 'toyota'],
  ['honda', 'honda'],
  ['hyundai', 'hyundai'],
  ['ford', 'ford'],
  ['chevrolet', 'chevrolet'],
  ['gm', 'chevrolet'],
  ['fiat', 'fiat'],
  ['jeep', 'jeep'],
  ['renault', 'renault'],
  ['nissan', 'nissan'],
  ['peugeot', 'peugeot'],
];

function iconeDaMarca(marca: string): { path: string; cor: string } | null {
  const nome = marca.toLowerCase();
  const encontrado = CHAVES.find(([trecho]) => nome.includes(trecho));
  return encontrado ? (BRAND_ICONS[encontrado[1]] ?? null) : null;
}

interface BrandLogoProps {
  marca: string;
  size?: number;
  className?: string;
}

export function BrandLogo({ marca, size = 56, className }: BrandLogoProps) {
  const icone = iconeDaMarca(marca);

  if (icone) {
    return (
      <svg
        className={className}
        width={size}
        height={size}
        viewBox="0 0 24 24"
        role="img"
        aria-label={marca}
        style={{ display: 'block' }}
      >
        <path d={icone.path} fill={icone.cor} />
      </svg>
    );
  }

  // Fallback: selo com a inicial da marca.
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
