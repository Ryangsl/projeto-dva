import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from './Logo';
import { ThemeToggle } from './ThemeToggle';

// Faixa fixa no topo das telas autenticadas: logo PROCAR em destaque + título
// da tela, e à direita as ações contextuais (slot), o botão de tema, o nome do
// usuário e Sair. Fica `position: fixed` (classe .app-topo) — o conteúdo das
// páginas reserva o espaço via padding-top no wrapper `.guia`.
interface AppHeaderProps {
  titulo: string;
  /** Ações específicas da tela (ex.: link "Monitoramento" / "← Guia"). */
  acoes?: ReactNode;
}

export function AppHeader({ titulo, acoes }: AppHeaderProps) {
  const { usuario, sair } = useAuth();
  const ref = useRef<HTMLElement>(null);

  // Com muitos links (perfil admin) a faixa pode quebrar em 2 linhas em telas
  // estreitas (ver .app-topo-in/.app-topo-dir com flex-wrap). `--topo-altura`
  // era uma constante fixa (60px) — se o conteúdo quebrasse linha, a faixa
  // ficava mais alta que o espaço reservado pelas páginas (`padding-top`) e o
  // conteúdo abaixo (ou os próprios itens da faixa) ficava sobreposto/cortado.
  // Medindo a altura real e sempre que ela mudar, nenhuma combinação de itens
  // ou largura de tela pode ficar mais alta do que o espaço reservado.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ultima = -1;
    const aplicar = () => {
      const altura = el.offsetHeight;
      // Só escreve quando o valor realmente muda. Além de evitar trabalho à
      // toa, corta um caminho de oscilação: mudar --topo-altura muda o
      // padding-top das páginas, o que pode fazer a barra de rolagem
      // aparecer/sumir, o que muda a largura da viewport e pode requebrar a
      // faixa — realimentando o observer.
      if (altura === ultima) return;
      ultima = altura;
      document.documentElement.style.setProperty('--topo-altura', `${altura}px`);
    };
    aplicar();
    const observer = new ResizeObserver(aplicar);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <header className="app-topo" ref={ref}>
      <div className="app-topo-in">
        <div className="app-topo-esq">
          <Logo height={52} />
          <span className="app-topo-titulo">{titulo}</span>
        </div>
        <div className="app-topo-dir">
          {acoes}
          {/* Disponível a todos os perfis, inclusive Admin (TI). */}
          {usuario && (
            <Link to="/minha-senha" className="app-topo-link">
              Minha senha
            </Link>
          )}
          <ThemeToggle />
          {usuario && <span className="app-topo-user">{usuario.nome}</span>}
          <button className="app-topo-btn" onClick={sair}>
            Sair
          </button>
        </div>
      </div>
    </header>
  );
}
