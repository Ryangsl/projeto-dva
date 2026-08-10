import { useEffect, useState } from 'react';
import { buscarVeiculoPorId, listarVeiculos } from '../../services/veiculos.service';
import type { VeiculoDetalhe, VeiculoResumo } from '../veiculos/veiculos.types';
import { VeiculoDetalheModal } from './VeiculoDetalheModal';

const LIMITE_PAGINA = 10;

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

// Primeira tabela HTML "de verdade" do projeto (o resto da interface usa
// listas em card) — os dados aqui (chassi/marca/modelo/centro/destino/data/
// operador) são genuinamente tabulares, então o formato pedido no documento
// do MVP é reproduzido literalmente.
export function VeiculosTabela() {
  const [chassiBusca, setChassiBusca] = useState('');
  const [pagina, setPagina] = useState(1);
  const [veiculos, setVeiculos] = useState<VeiculoResumo[]>([]);
  const [total, setTotal] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState('');
  const [selecionado, setSelecionado] = useState<VeiculoDetalhe | null>(null);

  useEffect(() => {
    setPagina(1);
  }, [chassiBusca]);

  useEffect(() => {
    let cancelado = false;
    const timer = window.setTimeout(() => {
      setCarregando(true);
      listarVeiculos({ chassi: chassiBusca || undefined, pagina, limite: LIMITE_PAGINA })
        .then((res) => {
          if (cancelado) return;
          setVeiculos(res.veiculos);
          setTotal(res.total);
          setErro('');
        })
        .catch(() => {
          if (!cancelado) setErro('Não foi possível carregar os veículos.');
        })
        .finally(() => {
          if (!cancelado) setCarregando(false);
        });
    }, 300);
    return () => {
      cancelado = true;
      window.clearTimeout(timer);
    };
  }, [chassiBusca, pagina]);

  async function abrirDetalhe(id: number) {
    try {
      setSelecionado(await buscarVeiculoPorId(id));
    } catch {
      setErro('Não foi possível carregar os detalhes do veículo.');
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
              <th>Marca</th>
              <th>Modelo</th>
              <th>Cor</th>
              <th>Centro</th>
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
                <td>{v.marcaNome}</td>
                <td>{v.modeloNome ?? '—'}</td>
                <td>{v.corNome ?? '—'}</td>
                <td>{v.centroNome}</td>
                <td>{v.destino ?? '—'}</td>
                <td>{formatarData(v.criadoEm)}</td>
                <td>{v.usuarioNome}</td>
                <td>
                  <button className="btn btn-secundario" onClick={() => abrirDetalhe(v.id)}>
                    Ver
                  </button>
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

      {selecionado && <VeiculoDetalheModal veiculo={selecionado} onFechar={() => setSelecionado(null)} />}
    </div>
  );
}
