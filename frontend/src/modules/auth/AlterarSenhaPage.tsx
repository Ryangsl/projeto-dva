import { useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppHeader } from '../../components/AppHeader';
import '../../styles/ui.css';

// Regras da nova senha (espelham a validação do backend).
const REGRAS = [
  { chave: 'tamanho', rotulo: 'Ao menos 8 caracteres', testar: (s: string) => s.length >= 8 },
  { chave: 'letra', rotulo: 'Ao menos uma letra', testar: (s: string) => /[A-Za-zÀ-ÿ]/.test(s) },
  { chave: 'numero', rotulo: 'Ao menos um número', testar: (s: string) => /[0-9]/.test(s) },
];

// Troca de senha voluntária (a qualquer momento, não só no primeiro acesso).
// Disponível para TODOS os perfis, inclusive Admin (TI): uma conta de acesso
// total sem caminho de troca de senha no app é justamente a que mais precisa
// dele — antes, só restava alterar o hash manualmente via SQL.
export function AlterarSenhaPage() {
  const { usuario, definirSenha } = useAuth();
  const navigate = useNavigate();
  const [senhaAtual, setSenhaAtual] = useState('');
  const [novaSenha, setNovaSenha] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const regrasOk = useMemo(() => REGRAS.map((r) => ({ ...r, ok: r.testar(novaSenha) })), [novaSenha]);
  const senhaValida = regrasOk.every((r) => r.ok);
  const confere = novaSenha.length > 0 && novaSenha === confirmar;
  const podeEnviar = senhaAtual.length > 0 && senhaValida && confere && !enviando;

  if (!usuario) return <Navigate to="/login" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    if (!podeEnviar) return;
    setEnviando(true);
    try {
      await definirSenha(senhaAtual, novaSenha);
      setSenhaAtual('');
      setNovaSenha('');
      setConfirmar('');
      setSucesso(true);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Não foi possível trocar a senha. Confira a senha atual e tente novamente.';
      setErro(msg);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="guia">
      <AppHeader titulo="Minha senha" />
      <div className="login-wrap" style={{ minHeight: 'auto', padding: '24px 16px' }}>
        <form className="card login-card" onSubmit={handleSubmit}>
          <h1 className="primeiro-titulo">Trocar minha senha</h1>
          <p className="login-tagline">Defina uma nova senha para sua conta quando quiser.</p>
          <div className="login-sep" />

          {erro && <div className="erro" role="alert">{erro}</div>}
          {sucesso && !erro && (
            <p className="senha-regras" style={{ color: 'var(--ok)' }}>
              Senha alterada com sucesso.
            </p>
          )}

          <div className="campo">
            <label htmlFor="senhaAtual">Senha atual</label>
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
            {enviando ? 'Salvando...' : 'Trocar senha'}
          </button>
          <button
            type="button"
            className="btn btn-secundario btn-bloco"
            style={{ marginTop: '10px' }}
            onClick={() => navigate('/guia')}
          >
            Voltar
          </button>
        </form>
      </div>
    </div>
  );
}
