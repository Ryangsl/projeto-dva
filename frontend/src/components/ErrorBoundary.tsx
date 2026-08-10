import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Logo } from './Logo';

interface Props {
  children: ReactNode;
}

interface State {
  erro: Error | null;
}

// Rede de segurança para erros de renderização. Sem isto, qualquer exceção num
// componente derruba a árvore inteira e deixa a tela BRANCA — no tablet do
// balcão, no meio de um atendimento, sem nenhum caminho de volta a não ser
// fechar e reabrir o navegador (o que, com a sessão efêmera, exige novo login).
//
// Precisa ser class component: é a única API do React que captura erros de
// render (não existe equivalente em hook).
export class ErrorBoundary extends Component<Props, State> {
  state: State = { erro: null };

  static getDerivedStateFromError(erro: Error): State {
    return { erro };
  }

  componentDidCatch(erro: Error, info: ErrorInfo): void {
    // Só console: não há serviço de telemetria no projeto (e mandar erro para
    // fora contrariaria o offline-first). Fica disponível no DevTools do tablet.
    console.error('Erro não tratado na interface:', erro, info.componentStack);
  }

  // "Tentar de novo" limpa o erro e remonta a árvore. Resolve o caso comum de
  // falha transitória (dado inesperado no cache) sem perder a sessão.
  private tentarDeNovo = (): void => {
    this.state.erro && this.setState({ erro: null });
  };

  render(): ReactNode {
    const { erro } = this.state;
    if (!erro) return this.props.children;

    return (
      <div className="login-wrap">
        <div className="card login-card" role="alert">
          <div className="login-logo">
            <Logo height={56} />
          </div>
          <h1 className="primeiro-titulo">Algo deu errado</h1>
          <p className="login-tagline">
            A tela não pôde ser exibida. Seus dados de acesso continuam válidos — tente novamente.
          </p>
          <div className="login-sep" />
          <button className="btn btn-primario btn-bloco" onClick={this.tentarDeNovo}>
            Tentar de novo
          </button>
          <button
            className="btn btn-secundario btn-bloco"
            style={{ marginTop: 8 }}
            onClick={() => window.location.reload()}
          >
            Recarregar a página
          </button>
        </div>
      </div>
    );
  }
}
