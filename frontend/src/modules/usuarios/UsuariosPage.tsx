import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';
import { Modal } from '../../components/Modal';
import {
  atualizarUsuario,
  criarUsuario,
  excluirUsuario,
  listarUsuarios,
  resetarSenha,
  type UsuarioGerenciado,
} from '../../services/usuarios.service';
import '../veiculos/veiculos.css';
import './usuarios.css';

function mensagemDeErro(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg ?? fallback;
}

interface FormularioCriacao {
  nome: string;
  email: string;
}

const FORM_VAZIO: FormularioCriacao = { nome: '', email: '' };

// Gerenciamento de operadores — tela exclusiva do Admin (o backend também restringe).
export function UsuariosPage() {
  const [lista, setLista] = useState<UsuarioGerenciado[] | null>(null);
  const [erro, setErro] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormularioCriacao>(FORM_VAZIO);
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [edicao, setEdicao] = useState<Partial<UsuarioGerenciado>>({});
  const [senhaGerada, setSenhaGerada] = useState<{ nome: string; senha: string } | null>(null);
  // Exclusão é irreversível: confirmamos em modal próprio (não em window.confirm,
  // que é visualmente idêntico ao aviso de reset e fácil de aceitar no automático).
  const [aExcluir, setAExcluir] = useState<UsuarioGerenciado | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  const carregar = useCallback(() => {
    listarUsuarios()
      .then(setLista)
      .catch(() => setErro('Não foi possível carregar os usuários.'));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const { usuario: criado, senhaTemporaria } = await criarUsuario({
        nome: form.nome,
        email: form.email,
      });
      setForm(FORM_VAZIO);
      setMostrarForm(false);
      setSenhaGerada({ nome: criado.nome, senha: senhaTemporaria });
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível criar o usuário.'));
    } finally {
      setEnviando(false);
    }
  }

  function iniciarEdicao(u: UsuarioGerenciado) {
    setEditandoId(u.id);
    setEdicao({ nome: u.nome, email: u.email });
  }

  async function salvarEdicao(id: number) {
    setErro('');
    try {
      await atualizarUsuario(id, { nome: edicao.nome, email: edicao.email });
      setEditandoId(null);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar as alterações.'));
    }
  }

  async function alternarAtivo(u: UsuarioGerenciado) {
    setErro('');
    try {
      await atualizarUsuario(u.id, { ativo: !u.ativo });
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar o status do usuário.'));
    }
  }

  async function handleResetarSenha(u: UsuarioGerenciado) {
    const confirmar = window.confirm(
      `Resetar a senha de ${u.nome}? A senha atual será invalidada e ${u.nome.split(' ')[0]} precisará definir uma nova no próximo acesso.`,
    );
    if (!confirmar) return;
    setErro('');
    try {
      const { senhaTemporaria } = await resetarSenha(u.id);
      setSenhaGerada({ nome: u.nome, senha: senhaTemporaria });
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível resetar a senha.'));
    }
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    setErro('');
    setExcluindo(true);
    try {
      await excluirUsuario(aExcluir.id);
      setAExcluir(null);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível excluir o usuário.'));
      setAExcluir(null);
    } finally {
      setExcluindo(false);
    }
  }

  return (
    <div className="guia">
      <AppHeader
        titulo="Usuários"
        acoes={
          <>
            <Link to="/meus-registros" className="app-topo-link">
              Meus Registros
            </Link>
            <Link to="/monitoramento" className="app-topo-link">
              Monitoramento
            </Link>
            <Link to="/veiculos/novo" className="app-topo-link">
              ← Cadastrar veículo
            </Link>
          </>
        }
      />

      <div className="usuarios-wrap">
        {erro && <div className="erro" role="alert">{erro}</div>}

        <div className="usuarios-topo">
          <p className="usuarios-legenda">Operadores do sistema.</p>
          <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Novo usuário'}
          </button>
        </div>

        {mostrarForm && (
          <form className="card usuarios-form" onSubmit={handleCriar}>
            <div className="campo">
              <label htmlFor="novo-nome">Nome</label>
              <input
                id="novo-nome"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
              />
            </div>
            <div className="campo">
              <label htmlFor="novo-email">E-mail</label>
              <input
                id="novo-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
              {enviando ? 'Criando...' : 'Criar usuário'}
            </button>
          </form>
        )}

        {!lista && !erro && <div className="guia-carregando">Carregando usuários...</div>}

        <div className="usuarios-lista">
          {lista?.map((u) => (
            <div key={u.id} className={`usuarios-item ${!u.ativo ? 'usuarios-item-inativo' : ''}`}>
              {editandoId === u.id ? (
                <div className="usuarios-edicao">
                  <input
                    className="usuarios-edicao-campo"
                    value={edicao.nome ?? ''}
                    onChange={(e) => setEdicao((f) => ({ ...f, nome: e.target.value }))}
                    placeholder="Nome"
                  />
                  <input
                    className="usuarios-edicao-campo"
                    value={edicao.email ?? ''}
                    onChange={(e) => setEdicao((f) => ({ ...f, email: e.target.value }))}
                    placeholder="E-mail"
                    type="email"
                  />
                  <div className="usuarios-edicao-acoes">
                    <button className="btn btn-primario" onClick={() => salvarEdicao(u.id)}>
                      Salvar
                    </button>
                    <button className="btn btn-secundario" onClick={() => setEditandoId(null)}>
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="usuarios-info">
                    <div className="usuarios-cab">
                      <span className="usuarios-nome">{u.nome}</span>
                      <span className="usuarios-badge">Operador</span>
                      {!u.ativo && <span className="usuarios-badge usuarios-badge-alerta">Inativo</span>}
                      {!u.senhaDefinida && (
                        <span className="usuarios-badge usuarios-badge-alerta">
                          Aguardando definição de senha
                        </span>
                      )}
                    </div>
                    <div className="usuarios-meta">{u.email}</div>
                  </div>
                  <div className="usuarios-acoes">
                    <button className="btn btn-secundario" onClick={() => iniciarEdicao(u)}>
                      Editar
                    </button>
                    <button className="btn btn-secundario" onClick={() => handleResetarSenha(u)}>
                      Resetar senha
                    </button>
                    <button className="btn btn-secundario" onClick={() => alternarAtivo(u)}>
                      {u.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                    <button className="btn btn-perigo" onClick={() => setAExcluir(u)}>
                      Excluir
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {lista && lista.length === 0 && <p className="guia-vazio">Nenhum usuário para exibir.</p>}
        </div>
      </div>

      {senhaGerada && (
        <Modal titulo="Senha temporária gerada" onFechar={() => setSenhaGerada(null)}>
          <p>
            Informe esta senha a <strong>{senhaGerada.nome}</strong> agora — ela não será exibida
            novamente. No próximo acesso, será obrigatório definir uma nova senha.
          </p>
          <div className="usuarios-senha-caixa">
            <code>{senhaGerada.senha}</code>
            <button
              className="btn btn-secundario"
              onClick={() => navigator.clipboard?.writeText(senhaGerada.senha)}
            >
              Copiar
            </button>
          </div>
          <button className="btn btn-primario btn-bloco" onClick={() => setSenhaGerada(null)}>
            Entendi
          </button>
        </Modal>
      )}

      {aExcluir && (
        <Modal titulo={`Excluir ${aExcluir.nome}?`} onFechar={() => setAExcluir(null)}>
          <p className="usuarios-modal-alerta">
            Esta ação é <strong>definitiva</strong> e não pode ser desfeita. O histórico de sessões
            deste usuário sai das métricas do sistema.
          </p>
          <p>
            Se a intenção é apenas impedir o acesso, use <strong>Desativar</strong> — o usuário
            deixa de entrar, mas os dados e o histórico permanecem.
          </p>
          <div className="usuarios-modal-acoes">
            <button className="btn btn-secundario" onClick={() => setAExcluir(null)}>
              Cancelar
            </button>
            <button className="btn btn-perigo" onClick={confirmarExclusao} disabled={excluindo}>
              {excluindo ? 'Excluindo...' : 'Excluir definitivamente'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
