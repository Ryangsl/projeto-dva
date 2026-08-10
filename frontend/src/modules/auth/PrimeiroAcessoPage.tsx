import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { Logo } from '../../components/Logo';
import { ThemeToggle } from '../../components/ThemeToggle';

// Regras da nova senha (espelham a validação do backend).
const REGRAS = [
  { chave: 'tamanho', rotulo: 'Ao menos 8 caracteres', testar: (s: string) => s.length >= 8 },
  { chave: 'letra', rotulo: 'Ao menos uma letra', testar: (s: string) => /[A-Za-zÀ-ÿ]/.test(s) },
  { chave: 'numero', rotulo: 'Ao menos um número', testar: (s: string) => /[0-9]/.test(s) },
];

// Tela obrigatória de primeiro acesso: o usuário logado com a senha temporária
// precisa definir uma senha própria antes de usar o sistema.
export function PrimeiroAcessoPage() {
  const { usuario, precisaTrocarSenha, definirSenha } = useAuth();
  const navigate = useNavigate();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const regrasOk = useMemo(() => REGRAS.map((r) => ({ ...r, ok: r.testar(novaSenha) })), [novaSenha]);
  const senhaValida = regrasOk.every((r) => r.ok);
  const confere = novaSenha.length > 0 && novaSenha === confirmar;
  const podeEnviar = senhaAtual.length > 0 && senhaValida && confere && !enviando;

  // Sem sessão → login. Já definiu a senha → não precisa mais desta tela.
  if (!usuario) return <Navigate to="/login" replace />;
  if (!precisaTrocarSenha) return <Navigate to="/veiculos/novo" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!podeEnviar) return;
    setEnviando(true);
    try {
      await definirSenha(senhaAtual, novaSenha);
      navigate('/veiculos/novo', { replace: true });
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Não foi possível definir a senha. Confira a senha atual e tente novamente.';
      setErro(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-wrap">
      <ThemeToggle className="tema-flutuante" />
      <form className="card login-card" onSubmit={handleSubmit}>
        <div className="login-logo">
          <Logo height={68} />
        </div>
        <h1 className="primeiro-titulo">Bem-vindo, {usuario.nome.split(' ')[0]}!</h1>
        <p className="login-tagline">
          Este é seu primeiro acesso. Defina uma nova senha para continuar.
        </p>
        <div className="login-sep" />

        {erro && <div className="erro" role="alert">{erro}</div>}

        <div className="campo">
          <label htmlFor="senhaAtual">Senha atual (temporária)</label>
          <input
            id="senhaAtual"
            type="password"
            value={senhaAtual}
            onChange={(e) => setSenhaAtual(e.target.value)}
            autoComplete="current-password"
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="novaSenha">Nova senha</label>
          <input
            id="novaSenha"
            type="password"
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="campo">
          <label htmlFor="confirmar">Confirmar nova senha</label>
          <input
            id="confirmar"
            type="password"
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <ul className="senha-regras">
          {regrasOk.map((r) => (
            <li key={r.chave} className={r.ok ? 'ok' : ''}>
              <span className="senha-regra-marca" aria-hidden="true">
                {r.ok ? '✓' : '○'}
              </span>
              {r.rotulo}
            </li>
          ))}
          <li className={confere ? 'ok' : ''}>
            <span className="senha-regra-marca" aria-hidden="true">
              {confere ? '✓' : '○'}
            </span>
            As senhas coincidem
          </li>
        </ul>

        <button type="submit" className="btn btn-primario btn-bloco" disabled={!podeEnviar}>
          {enviando ? 'Salvando...' : 'Definir senha e entrar'}
        </button>
      </form>
    </div>
  );
}
