import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppHeader } from '../../components/AppHeader';
import { VeiculosTabela } from './VeiculosTabela';
import './monitoramento.css';
import '../veiculos/veiculos.css';

// Histórico dos veículos cadastrados pelo próprio usuário logado — disponível
// tanto para Operador quanto para Admin (cada um vê só os próprios registros,
// nunca os de outra pessoa; o backend garante isso, não é um filtro de UI).
export function MeusRegistrosPage() {
  const { usuario } = useAuth();
  const souAdmin = usuario?.perfil === 'admin';

  return (
    <div className="guia">
      <AppHeader
        titulo="Meus Registros"
        acoes={
          <>
            {souAdmin && (
              <>
                <Link to="/usuarios" className="app-topo-link">
                  Usuários
                </Link>
                <Link to="/monitoramento" className="app-topo-link">
                  Monitoramento
                </Link>
              </>
            )}
            <Link to="/veiculos/novo" className="app-topo-link">
              ← Cadastrar veículo
            </Link>
          </>
        }
      />

      <div className="dash">
        <div className="card dash-card">
          <h2 className="guia-col-titulo">Veículos que você cadastrou</h2>
          <VeiculosTabela apenasMeus />
        </div>
      </div>
    </div>
  );
}
