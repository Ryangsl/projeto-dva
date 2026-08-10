import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';
import '../../styles/ui.css';

export function LoginPage() {
  const { usuario, precisaTrocarSenha, entrar } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
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
    <div className="login-wrap">
      <ThemeToggle className="tema-flutuante" />
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <Logo height={84} />
        </div>
        <p className="login-tagline">
          Gerenciamento e distribuição de veículos do Grupo DVA.
        </p>
        <div className="login-sep" />

        {erro && <div className="erro" role="alert">{erro}</div>}

        <div className="campo">
          <label htmlFor="email">E-mail</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="senha">Senha</label>
          <input
            id="senha"
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>

        <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
          {enviando ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  );
}
