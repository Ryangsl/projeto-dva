import { useState, type FormEvent, type SVGProps } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../../components/Logo';
import './login.css';

// Placeholder do modelo de referência (fundo claro — o véu escuro em
// login.css compensa). Trocar aqui quando a foto definitiva (carro escuro)
// for adicionada em public/images/.
const IMAGEM_PAINEL = '/images/fundo-supercar.png';

function IconePessoa(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5 20c0-3.9 3.1-6.5 7-6.5s7 2.6 7 6.5" />
    </svg>
  );
}

function IconeCadeado(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function IconeOlho(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconeOlhoFechado(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17.9 17.9 0 0 1-3.6 4.6M6.6 6.6C4 8.3 2 12 2 12s3.6 7 10 7a10.4 10.4 0 0 0 4.2-.9" />
      <path d="M9.5 9.8a3 3 0 0 0 4.2 4.2" />
    </svg>
  );
}

function IconeSeta(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </svg>
  );
}

function IconeEscudo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3Z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

export function LoginPage() {
  const { usuario, precisaTrocarSenha, entrar } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Já autenticado: vai direto ao destino certo (as guardas de rota confirmam).
  if (usuario) {
    return <Navigate to={precisaTrocarSenha ? '/primeiro-acesso' : '/veiculos/novo'} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await entrar(email, senha);
      // As guardas de rota redirecionam para /primeiro-acesso quando necessário.
      navigate('/veiculos/novo', { replace: true });
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      setErro(
        status === 429
          ? 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
          : 'E-mail ou senha inválidos.',
      );
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-tela">
      <div className="login-tela-imagem">
        <img src={IMAGEM_PAINEL} alt="" className="login-tela-foto" />
        <div className="login-tela-imagem-veu" />
        <div className="login-tela-corte" />
        <div className="login-tela-selo">
          <span className="login-tela-selo-icone">
            <IconeEscudo />
          </span>
          <p>
            Gestão inteligente.
            <br />
            Resultados que <strong>movem</strong>.
          </p>
        </div>
      </div>

      <div className="login-tela-form">
        <form className="login-tela-card" onSubmit={handleSubmit}>
          <div className="login-tela-logo">
            <Logo height={56} className="login-tela-logo-img" />
          </div>
          <div className="login-tela-sep" />
          <p className="login-tela-tagline">
            Gerenciamento e distribuição de veículos do Grupo ProCar.
          </p>

          {erro && (
            <div className="login-tela-erro" role="alert">
              {erro}
            </div>
          )}

          <div className="login-tela-campo">
            <label htmlFor="email">E-mail</label>
            <div className="login-tela-input-wrap">
              <IconePessoa className="login-tela-input-icone" />
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
          </div>
          <div className="login-tela-campo login-tela-campo-senha">
            <label htmlFor="senha">Senha</label>
            <div className="login-tela-input-wrap">
              <IconeCadeado className="login-tela-input-icone" />
              <input
                id="senha"
                type={mostrarSenha ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="login-tela-olho"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                aria-pressed={mostrarSenha}
              >
                {mostrarSenha ? <IconeOlhoFechado /> : <IconeOlho />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-tela-entrar" disabled={enviando}>
            {enviando ? (
              'Entrando...'
            ) : (
              <>
                Entrar <IconeSeta />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
