import { useTheme } from '../contexts/ThemeContext';

// Botão de alternância claro/escuro. Ícone sol/lua (SVG inline, sem imagem
// externa — mantém o offline-first). Reutilizável no topo autenticado e na
// tela de login.
export function ThemeToggle({ className }: { className?: string }) {
  const { tema, alternar } = useTheme();
  const escuro = tema === 'escuro';
  return (
    <button
      type="button"
      className={`tema-toggle ${className ?? ''}`}
      onClick={alternar}
      aria-label={escuro ? 'Mudar para tema claro' : 'Mudar para tema escuro'}
      title={escuro ? 'Tema claro' : 'Tema escuro'}
    >
      {escuro ? (
        // Sol
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="4.2" fill="currentColor" />
          <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <line x1="12" y1="2.5" x2="12" y2="5" />
            <line x1="12" y1="19" x2="12" y2="21.5" />
            <line x1="2.5" y1="12" x2="5" y2="12" />
            <line x1="19" y1="12" x2="21.5" y2="12" />
            <line x1="5.2" y1="5.2" x2="7" y2="7" />
            <line x1="17" y1="17" x2="18.8" y2="18.8" />
            <line x1="18.8" y1="5.2" x2="17" y2="7" />
            <line x1="7" y1="17" x2="5.2" y2="18.8" />
          </g>
        </svg>
      ) : (
        // Lua
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.3 8.3 0 1 0 10.5 10.5z"
            fill="currentColor"
          />
        </svg>
      )}
    </button>
  );
}
