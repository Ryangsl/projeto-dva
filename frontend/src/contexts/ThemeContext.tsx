import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

// Tema é preferência de UI do dispositivo (não é dado de sessão): pode e deve
// persistir entre visitas — fica no localStorage. O valor é aplicado como
// atributo `data-theme` no <html>, de onde as variáveis de tema do CSS derivam.
export type Tema = 'claro' | 'escuro';

const STORAGE_KEY = 'procar.tema';

export function temaInicial(): Tema {
  const salvo = localStorage.getItem(STORAGE_KEY);
  if (salvo === 'claro' || salvo === 'escuro') return salvo;
  // Sem preferência salva: acompanha o sistema operacional.
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro';
}

export function aplicarTema(tema: Tema): void {
  document.documentElement.setAttribute('data-theme', tema);
  const cor = document.querySelector('meta[name="theme-color"]');
  if (cor) cor.setAttribute('content', tema === 'escuro' ? '#0e141c' : '#ffffff');
}

interface ThemeContextValue {
  tema: Tema;
  alternar: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => temaInicial());

  useEffect(() => {
    aplicarTema(tema);
    localStorage.setItem(STORAGE_KEY, tema);
  }, [tema]);

  const alternar = useCallback(() => {
    setTema((t) => (t === 'escuro' ? 'claro' : 'escuro'));
  }, []);

  const value = useMemo(() => ({ tema, alternar }), [tema, alternar]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme deve ser usado dentro de ThemeProvider');
  return ctx;
}
