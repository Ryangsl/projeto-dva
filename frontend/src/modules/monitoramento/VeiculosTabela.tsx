import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { Modal } from '../../components/Modal';
import { buscarVeiculoPorId, excluirVeiculo, listarVeiculos } from '../../services/veiculos.service';
import type { VeiculoDetalhe, VeiculoResumo } from '../veiculos/veiculos.types';
import { VeiculoDetalheModal } from './VeiculoDetalheModal';

const LIMITE_PAGINA = 10;

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function mensagemDeErro(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg ?? fallback;
}

// Primeira tabela HTML "de verdade" do projeto (o resto da interface usa
// listas em card) — os dados aqui (chassi/marca/modelo/destino/data/operador)
// são genuinamente tabulares, então o formato pedido no documento do MVP é
// reproduzido literalmente. Visível a qualquer perfil autenticado, mostrando
// os registros de todos os usuários — só a exclusão fica restrita ao Admin.
export function VeiculosTabela() {
  const { usuario } = useAuth();
  const souAdmin = usuario?.perfil === 'admin';

  const [chassiBusca, setChassiBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [veiculos, setVeiculos] = useState<VeiculoResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [selecionado, setSelecionado] = useState<VeiculoDetalhe | null>(null);
  // Exclusão é irreversível: confirmamos em modal próprio (não em
  // window.confirm), mesmo padrão já usado em Usuários.
  const [aExcluir, setAExcluir] = useState<VeiculoResumo | null>(null);
  const [excluindo, setExcluindo] = useState(false);

  useEffect(() => {
    setPagina(1);
  }, [chassiBusca]);

  const carregar = useCallback(() => {
    setCarregando(true);
    return listarVeiculos({ chassi: chassiBusca || undefined, pagina, limite: LIMITE_PAGINA })
      .then((res) => {
        setVeiculos(res.veiculos);
        setTotal(res.total);
        setErro('');
      })
      .catch(() => setErro('Não foi possível carregar os veículos.'))
      .finally(() => setCarregando(false));
  }, [chassiBusca, pagina]);

  useEffect(() => {
    let cancelado = false;
    const timer = window.setTimeout(() => {
      if (!cancelado) carregar();
    }, 300);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [carregar]);

  async function abrirDetalhe(id: number) {
    try {
      setSelecionado(await buscarVeiculoPorId(id));
    } catch {
      setErro('Não foi possível carregar os detalhes do veículo.');
    }
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    setErro('');
    setExcluindo(true);
    try {
      await excluirVeiculo(aExcluir.id);
      setAExcluir(null);
      setSelecionado(null);
      carregar();
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível excluir o veículo.'));
      setAExcluir(null);
    } finally {
      setExcluindo(false);
    }
  }

  const totalPaginas = Math.max(1, Math.ceil(total / LIMITE_PAGINA));

  return (
    <div>
      <input
        className="guia-busca-modelo"
        placeholder="Buscar por chassi..."
        value={chassiBusca}
        onChange={(e) => setChassiBusca(e.target.value)}
      />

      {erro && <div className="erro" role="alert">{erro}</div>}

      <div className="veiculos-tabela-wrap">
        <table className="veiculos-tabela">
          <thead>
            <tr>
              <th>Chassi</th>
              <th>Protocolo</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Destino</th>
              <th>Data</th>
              <th>Usuário</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {veiculos.map((v) => (
              <tr key={v.id}>
                <td>{v.chassi}</td>
                <td>{v.protocolo}</td>
                <td>{v.marcaNome}</td>
                <td>{v.modeloNome ?? '—'}</td>
                <td>{v.destino ?? '—'}</td>
                <td>{formatarData(v.criadoEm)}</td>
                <td>{v.usuarioNome}</td>
                <td>
                  <div className="veiculos-tabela-acoes">
                    <button className="btn btn-secundario" onClick={() => abrirDetalhe(v.id)}>
                      Ver
                    </button>
                    {souAdmin && (
                      <button className="btn btn-perigo" onClick={() => setAExcluir(v)}>
                        Excluir
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!carregando && veiculos.length === 0 && <p className="guia-vazio">Nenhum veículo encontrado.</p>}
      {carregando && <p className="guia-hint">Carregando...</p>}

      {totalPaginas > 1 && (
        <div className="dash-paginacao">
          <button className="btn btn-secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>
            ← Anterior
          </button>
          <span>
            Página {pagina} de {totalPaginas}
          </span>
          <button
            className="btn btn-secundario"
            disabled={pagina >= totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
          >
            Próxima →
          </button>
        </div>
      )}

      {selecionado && (
        <VeiculoDetalheModal
          veiculo={selecionado}
          onFechar={() => setSelecionado(null)}
          souAdmin={souAdmin}
          onExcluir={() => setAExcluir(selecionado)}
        />
      )}

      {aExcluir && (
        <Modal titulo={`Excluir veículo ${aExcluir.chassi}?`} onFechar={() => setAExcluir(null)}>
          <p className="usuarios-modal-alerta">
            Esta ação é <strong>definitiva</strong> e não pode ser desfeita. Fotos e vídeo anexados
            também são removidos. Protocolo: <strong>{aExcluir.protocolo}</strong>.
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
