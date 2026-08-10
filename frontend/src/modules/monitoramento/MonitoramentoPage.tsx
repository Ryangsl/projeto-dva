import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppHeader } from '../../components/AppHeader';
import { buscarDashboard, type ContagemPorGrupo, type DashboardVeiculos, type PeriodoDias } from '../../services/monitoramento.service';
import { GraficoVeiculosPorDia } from './GraficoVeiculosPorDia';
import { VeiculosTabela } from './VeiculosTabela';
import './monitoramento.css';
import '../veiculos/veiculos.css';

const PERIODOS: PeriodoDias[] = [7, 30, 60];
const INTERVALO_ATUALIZACAO_MS = 30_000;

function Kpi({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="kpi">
      <span className="kpi-rotulo">{rotulo}</span>
      <span className="kpi-valor">{valor}</span>
    </div>
  );
}

function RankingCard({ titulo, itens }: { titulo: string; itens: ContagemPorGrupo[] }) {
  const maior = Math.max(1, ...itens.map((i) => i.total));
  return (
    <div className="card dash-card">
      <h2 className="guia-col-titulo">{titulo}</h2>
      {itens.length === 0 ? (
        <p className="guia-hint">Nenhum registro ainda.</p>
      ) : (
        <ul className="ranking">
          {itens.map((i) => (
            <li key={i.nome} className="ranking-item">
              <span className="ranking-nome">{i.nome}</span>
              <span className="ranking-barra-wrap">
                <span className="ranking-barra" style={{ width: `${(i.total / maior) * 100}%` }} />
              </span>
              <span className="ranking-total">{i.total}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// Painel do Admin: indicadores de cadastro de veículos (não mais uso/sessão,
// que era o antigo dashboard do Guia). Polling leve de 30s, mesmo padrão já
// validado no projeto para telas de monitoramento.
export function MonitoramentoPage() {
  const [periodo, setPeriodo] = useState<PeriodoDias>(30);
  const [dash, setDash] = useState<DashboardVeiculos | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let cancelado = false;
    let primeiraCarga = true;

    function carregar() {
      buscarDashboard(periodo)
        .then((dados) => {
          if (cancelado) return;
          setDash(dados);
          setErro('');
        })
        .catch(() => {
          if (!cancelado && primeiraCarga) setErro('Não foi possível carregar o monitoramento.');
        })
        .finally(() => {
          primeiraCarga = false;
        });
    }

    carregar();
    const id = window.setInterval(carregar, INTERVALO_ATUALIZACAO_MS);
    return () => {
      cancelado = true;
      window.clearInterval(id);
    };
  }, [periodo]);

  return (
    <div className="guia">
      <AppHeader
        titulo="Monitoramento"
        acoes={
          <>
            <Link to="/usuarios" className="app-topo-link">
              Usuários
            </Link>
            <Link to="/centros" className="app-topo-link">
              Centros
            </Link>
            <Link to="/veiculos/novo" className="app-topo-link">
              ← Cadastrar veículo
            </Link>
          </>
        }
      />

      <div className="dash">
        {erro && <div className="guia-erro" role="alert">{erro}</div>}

        <div className="dash-periodo">
          {PERIODOS.map((p) => (
            <button
              key={p}
              className={`dash-periodo-btn ${periodo === p ? 'dash-periodo-btn-ativo' : ''}`}
              onClick={() => setPeriodo(p)}
            >
              {p} dias
            </button>
          ))}
        </div>

        {!dash && !erro && <div className="guia-carregando">Carregando monitoramento...</div>}

        {dash && (
          <>
            <div className="dash-kpis">
              <Kpi rotulo="Total de veículos" valor={dash.totalVeiculos} />
              <Kpi rotulo="Cadastrados hoje" valor={dash.veiculosHoje} />
              <Kpi rotulo={`Últimos ${periodo} dias`} valor={dash.veiculosPeriodo} />
            </div>

            <div className="card dash-card">
              <h2 className="guia-col-titulo">Veículos cadastrados por dia</h2>
              <GraficoVeiculosPorDia pontos={dash.serieDiaria} />
            </div>

            <div className="dash-rankings">
              <RankingCard titulo="Por centro de distribuição" itens={dash.porCentro} />
              <RankingCard titulo="Por marca" itens={dash.porMarca} />
            </div>

            <div className="card dash-card">
              <h2 className="guia-col-titulo">Veículos cadastrados</h2>
              <VeiculosTabela />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
