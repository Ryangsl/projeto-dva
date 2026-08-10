// Identidade oficial da PROCAR (imagem em `public/images`, servida na raiz —
// arquivos de `public/` são referenciados por URL, não importados/bundlados).
// Mantém a mesma API (`height`/`className`) usada em todo o sistema. No tema
// escuro a arte preta é invertida para branco via filtro CSS (`.logo-procar`),
// preservando o contraste sem precisar de um segundo arquivo.
const LOGO_URL = '/images/logo-procar-preto.png';

interface LogoProps {
  height?: number;
  className?: string;
}

export function Logo({ height = 40, className }: LogoProps) {
  return (
    <img
      src={LOGO_URL}
      alt="PROCAR"
      className={`logo-procar ${className ?? ''}`}
      style={{ height, width: 'auto', display: 'block' }}
    />
  );
}
