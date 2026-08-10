import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppHeader } from '../../components/AppHeader';
import { BrandLogo } from '../../components/BrandLogo';
import { Modal } from '../../components/Modal';
import {
  atualizarUsuario,
  buscarMarcasDisponiveis,
  criarUsuario,
  excluirUsuario,
  listarUsuarios,
  resetarSenha,
  type PerfilGerenciavel,
  type UsuarioGerenciado,
} from '../../services/usuarios.service';
import '../../styles/ui.css';
import '../guia/guia.css';
import './usuarios.css';

function mensagemDeErro(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg ?? fallback;
}

const PERFIL_ROTULO: Record<PerfilGerenciavel, string> = {
  consultor: 'Consultor',
  gestor: 'Gestor',
};

// Seletor de múltiplas lojas (chips toggle) — usado para o Gestor, que pode
// administrar mais de uma concessionária.
function SeletorMarcas({
  opcoes,
  selecionadas,
  onToggle,
}: {
  opcoes: string[];
  selecionadas: string[];
  onToggle: (marca: string) => void;
}) {
  return (
    <div className="guia-chips">
      {opcoes.map((m) => (
        <button
          type="button"
          key={m}
          className={`chip ${selecionadas.includes(m) ? 'chip-ativo' : ''}`}
          onClick={() => onToggle(m)}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

interface FormularioCriacao {
  nome: string;
  email: string;
  perfil: PerfilGerenciavel;
  marca: string; // consultor (única loja) ou gestor-scope escolhendo uma das suas
  marcasGestor: string[]; // gestor criado pelo Admin (uma ou mais lojas)
}

const FORM_VAZIO: FormularioCriacao = {
  nome: '',
  email: '',
  perfil: 'consultor',
  marca: '',
  marcasGestor: [],
};

// Gerenciamento de usuários: Admin vê/gerencia todos os Consultores e
// Gestores; Gestor só os Consultores das lojas que administra (pode ser mais
// de uma) — aplicado no backend, esta tela só reflete o que a API devolve.
export function UsuariosPage() {
  const { usuario } = useAuth();
  const [lista, setLista] = useState<UsuarioGerenciado[] | null>(null);
  const [marcas, setMarcas] = useState<string[]>([]);
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

  const souAdmin = usuario?.perfil === 'admin';
  // Gestor com mais de uma loja precisa escolher em qual delas o novo
  // consultor entra; com uma só, a loja é implícita.
  const gestorEscolheLoja = !souAdmin && (usuario?.marcas.length ?? 0) > 1;

  const carregar = useCallback(() => {
    listarUsuarios()
      .then(setLista)
      .catch(() => setErro('Não foi possível carregar os usuários.'));
  }, []);

  useEffect(() => {
    carregar();
    buscarMarcasDisponiveis()
      .then(setMarcas)
      .catch(() => {
        /* selects ficam vazios; o formulário acusa ao tentar enviar sem loja */
      });
  }, [carregar]);

  // Área exclusiva de Admin/Gestor (o backend também restringe).
  if (usuario && usuario.perfil === 'consultor') return <Navigate to="/guia" replace />;

  function alternarMarcaForm(m: string) {
    setForm((f) => ({
      ...f,
      marcasGestor: f.marcasGestor.includes(m)
        ? f.marcasGestor.filter((x) => x !== m)
        : [...f.marcasGestor, m],
    }));
  }

  function alternarMarcaEdicao(m: string) {
    setEdicao((f) => {
      const atuais = f.marcas ?? [];
      return {
        ...f,
        marcas: atuais.includes(m) ? atuais.filter((x) => x !== m) : [...atuais, m],
      };
    });
  }

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const payload = souAdmin
        ? form.perfil === 'consultor'
          ? { nome: form.nome, email: form.email, perfil: form.perfil, marca: form.marca }
          : { nome: form.nome, email: form.email, perfil: form.perfil, marcas: form.marcasGestor }
        : {
            nome: form.nome,
            email: form.email,
            perfil: 'consultor' as const,
            marca: form.marca || usuario?.marcas[0] || '',
          };
      const { usuario: criado, senhaTemporaria } = await criarUsuario(payload);
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
    setEdicao({
      nome: u.nome,
      email: u.email,
      perfil: u.perfil,
      marca: u.marca ?? undefined,
      marcas: u.marcas,
    });
  }

  async function salvarEdicao(id: number) {
    setErro('');
    try {
      await atualizarUsuario(id, {
        nome: edicao.nome,
        email: edicao.email,
        ...(souAdmin
          ? {
              perfil: edicao.perfil as PerfilGerenciavel,
              ...(edicao.perfil === 'gestor'
                ? { marcas: edicao.marcas ?? [] }
                : { marca: edicao.marca ?? undefined }),
            }
          : {}),
      });
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

  const legenda = souAdmin
    ? 'Consultores e gestores de todas as lojas.'
    : usuario && usuario.marcas.length > 0
      ? `Consultores da${usuario.marcas.length > 1 ? 's lojas' : ' loja'} ${usuario.marcas.join(', ')}.`
      : '';

  return (
    <div className="guia">
      <AppHeader
        titulo="Usuários"
        acoes={
          <>
            <Link to="/gestor/uso" className="app-topo-link">
              Monitoramento
            </Link>
            <Link to="/guia" className="app-topo-link">
              ← Guia
            </Link>
          </>
        }
      />

      <div className="usuarios-wrap">
        {erro && <div className="erro" role="alert">{erro}</div>}

        <div className="usuarios-topo">
          <p className="usuarios-legenda">{legenda}</p>
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
            {souAdmin ? (
              <>
                <div className="campo">
                  <label htmlFor="novo-perfil">Perfil</label>
                  <select
                    id="novo-perfil"
                    value={form.perfil}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, perfil: e.target.value as PerfilGerenciavel }))
                    }
                  >
                    <option value="consultor">Consultor</option>
                    <option value="gestor">Gestor</option>
                  </select>
                </div>
                {form.perfil === 'consultor' ? (
                  <div className="campo">
                    <label htmlFor="novo-marca">Loja (marca)</label>
                    <select
                      id="novo-marca"
                      value={form.marca}
                      onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
                      required
                    >
                      <option value="" disabled>
                        Selecione...
                      </option>
                      {marcas.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="campo">
                    <label>Lojas administradas (uma ou mais)</label>
                    <SeletorMarcas
                      opcoes={marcas}
                      selecionadas={form.marcasGestor}
                      onToggle={alternarMarcaForm}
                    />
                  </div>
                )}
              </>
            ) : gestorEscolheLoja ? (
              <div className="campo">
                <label htmlFor="novo-marca-gestor">Loja (marca)</label>
                <select
                  id="novo-marca-gestor"
                  value={form.marca}
                  onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))}
                  required
                >
                  <option value="" disabled>
                    Selecione...
                  </option>
                  {usuario?.marcas.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="usuarios-legenda">
                Criado como Consultor da loja {usuario?.marcas[0] ?? ''}.
              </p>
            )}
            <button
              type="submit"
              className="btn btn-primario btn-bloco"
              disabled={enviando || (souAdmin && form.perfil === 'gestor' && form.marcasGestor.length === 0)}
            >
              {enviando ? 'Criando...' : 'Criar usuário'}
            </button>
          </form>
        )}

        {!lista && !erro && <div className="guia-carregando">Carregando usuários...</div>}

        <div className="usuarios-lista">
          {lista?.map((u) => (
            <div key={u.id} className={`usuarios-item ${!u.ativo ? 'usuarios-item-inativo' : ''}`}>
              {u.marca ? <BrandLogo marca={u.marca} size={36} /> : <div className="usuarios-avatar" />}

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
                  {souAdmin && (
                    <>
                      <select
                        className="usuarios-edicao-campo"
                        value={edicao.perfil ?? 'consultor'}
                        onChange={(e) =>
                          setEdicao((f) => ({ ...f, perfil: e.target.value as PerfilGerenciavel }))
                        }
                      >
                        <option value="consultor">Consultor</option>
                        <option value="gestor">Gestor</option>
                      </select>
                      {edicao.perfil === 'gestor' ? (
                        <div className="usuarios-edicao-marcas">
                          <SeletorMarcas
                            opcoes={marcas}
                            selecionadas={edicao.marcas ?? []}
                            onToggle={alternarMarcaEdicao}
                          />
                        </div>
                      ) : (
                        <select
                          className="usuarios-edicao-campo"
                          value={edicao.marca ?? ''}
                          onChange={(e) => setEdicao((f) => ({ ...f, marca: e.target.value }))}
                        >
                          {marcas.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                      )}
                    </>
                  )}
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
                      <span className="usuarios-badge">{PERFIL_ROTULO[u.perfil]}</span>
                      {!u.ativo && <span className="usuarios-badge usuarios-badge-alerta">Inativo</span>}
                      {!u.senhaDefinida && (
                        <span className="usuarios-badge usuarios-badge-alerta">
                          Aguardando definição de senha
                        </span>
                      )}
                    </div>
                    <div className="usuarios-meta">
                      {u.email}
                      {u.marca && ` · ${u.marca}`}
                      {u.marcas.length > 0 && ` · ${u.marcas.join(', ')}`}
                    </div>
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
                    {/* Exclusão definitiva: só Admin (o backend também exige). */}
                    {souAdmin && (
                      <button className="btn btn-perigo" onClick={() => setAExcluir(u)}>
                        Excluir
                      </button>
                    )}
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
            Esta ação é <strong>definitiva</strong> e não pode ser desfeita. O histórico de uso
            deste usuário (acessos e atendimentos) sai das métricas do monitoramento.
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
