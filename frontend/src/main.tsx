import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/global.css';
// Primitivas de UI (.btn, .card, .campo, .erro...) usadas por praticamente
// toda tela — importadas uma vez aqui, no bundle principal, em vez de por
// página. Antes cada página que precisava dessas classes importava o arquivo
// por conta própria; qualquer uma que esquecesse (ou um chunk lazy carregado
// "direto", sem passar por uma página que já tivesse importado antes na mesma
// sessão) renderizava sem elas — foi o caso do modal de detalhe do veículo em
// Monitoramento, que só "funcionava" nos testes porque o CSS já tinha sido
// carregado por uma visita anterior a /usuarios na mesma sessão do navegador.
import './styles/ui.css';

// ErrorBoundary por dentro do ThemeProvider (para a tela de erro respeitar o
// tema) e por fora do resto: qualquer falha de render em rota, contexto de auth
// ou componente cai numa tela com saída, em vez de deixar o tablet em branco.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <ErrorBoundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </ErrorBoundary>
    </ThemeProvider>
  </StrictMode>,
);
