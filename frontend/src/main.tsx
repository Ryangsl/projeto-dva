import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import './styles/global.css';

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
