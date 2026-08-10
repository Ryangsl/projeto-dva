import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';
import { atualizarCentro, criarCentro, listarCentros, type Centro } from '../../services/centros.service';
import '../veiculos/veiculos.css';
import '../usuarios/usuarios.css';

function mensagemDeErro(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg ?? fallback;
}

// Gestão de Centros de Distribuição — tela exclusiva do Admin (o backend
// também restringe). Mesmo padrão de UsuariosPage, bem mais simples: só nome
// + ativo/inativo (sem exclusão física — usuários/veículos referenciam por FK).
export function CentrosPage() {
  const [lista, setLista] = useState<Centro[] | null>(null);
  const [erro, setErro] = useState('');
  const [mostrarForm, setMostrarForm] = useState(false);
  const [nome, setNome] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [editandoId, setEditandoId] = useState<number | null>(null);
  const [nomeEdicao, setNomeEdicao] = useState('');

  const carregar = useCallback(() => {
    listarCentros()
      .then(setLista)
      .catch(() => setErro('Não foi possível carregar os centros de distribuição.'));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  async function handleCriar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await criarCentro(nome);
      setNome('');
      setMostrarForm(false);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível criar o centro de distribuição.'));
    } finally {
      setEnviando(false);
    }
  }

  function iniciarEdicao(c: Centro) {
    setEditandoId(c.id);
    setNomeEdicao(c.nome);
  }

  async function salvarEdicao(id: number) {
    setErro('');
    try {
      await atualizarCentro(id, { nome: nomeEdicao });
      setEditandoId(null);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar as alterações.'));
    }
  }

  async function alternarAtivo(c: Centro) {
    setErro('');
    try {
      await atualizarCentro(c.id, { ativo: !c.ativo });
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível alterar o status do centro.'));
    }
  }

  return (
    <div className="guia">
      <AppHeader
        titulo="Centros de Distribuição"
        acoes={
          <>
            <Link to="/usuarios" className="app-topo-link">
              Usuários
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
          <p className="usuarios-legenda">Centros de distribuição do Grupo DVA.</p>
          <button className="btn btn-primario" onClick={() => setMostrarForm((v) => !v)}>
            {mostrarForm ? 'Cancelar' : '+ Novo centro'}
          </button>
        </div>

        {mostrarForm && (
          <form className="card usuarios-form" onSubmit={handleCriar}>
            <div className="campo">
              <label htmlFor="novo-centro-nome">Nome</label>
              <input id="novo-centro-nome" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </div>
            <button type="submit" className="btn btn-primario btn-bloco" disabled={enviando}>
              {enviando ? 'Criando...' : 'Criar centro'}
            </button>
          </form>
        )}

        {!lista && !erro && <div className="guia-carregando">Carregando centros...</div>}

        <div className="usuarios-lista">
          {lista?.map((c) => (
            <div key={c.id} className={`usuarios-item ${!c.ativo ? 'usuarios-item-inativo' : ''}`}>
              {editandoId === c.id ? (
                <div className="usuarios-edicao">
                  <input
                    className="usuarios-edicao-campo"
                    value={nomeEdicao}
                    onChange={(e) => setNomeEdicao(e.target.value)}
                    placeholder="Nome"
                  />
                  <div className="usuarios-edicao-acoes">
                    <button className="btn btn-primario" onClick={() => salvarEdicao(c.id)}>
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
                      <span className="usuarios-nome">{c.nome}</span>
                      {!c.ativo && <span className="usuarios-badge usuarios-badge-alerta">Inativo</span>}
                    </div>
                  </div>
                  <div className="usuarios-acoes">
                    <button className="btn btn-secundario" onClick={() => iniciarEdicao(c)}>
                      Editar
                    </button>
                    <button className="btn btn-secundario" onClick={() => alternarAtivo(c)}>
                      {c.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {lista && lista.length === 0 && <p className="guia-vazio">Nenhum centro de distribuição cadastrado.</p>}
        </div>
      </div>
    </div>
  );
}
