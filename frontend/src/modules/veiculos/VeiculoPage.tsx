import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppHeader } from '../../components/AppHeader';
import { buscarOpcoes, criarVeiculo } from '../../services/veiculos.service';
import { VeiculoConfirmacao } from './VeiculoConfirmacao';
import { VeiculoWizard } from './VeiculoWizard';
import { NOVO_VEICULO_VAZIO, type NovoVeiculo, type OpcoesFormulario, type VeiculoDetalhe } from './veiculos.types';
import './veiculos.css';

function mensagemDeErro(err: unknown, fallback: string): string {
  const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return msg ?? fallback;
}

// Orquestra as duas telas do cadastro de veículo:
//  1. Wizard — o operador preenche centro/marca/modelo/chassi/cor/evidências;
//  2. Confirmação — resumo do que foi salvo, com atalho para cadastrar outro.
// Ao contrário do antigo Guia, o cadastro É gravado no banco (upload de
// fotos/vídeo exige rede de qualquer forma) — não há cache offline aqui.
export function VeiculoPage() {
  const { usuario } = useAuth();
  const [dados, setDados] = useState<OpcoesFormulario | null>(null);
  const [erro, setErro] = useState('');
  const [veiculo, setVeiculo] = useState<NovoVeiculo>(NOVO_VEICULO_VAZIO);
  const [criado, setCriado] = useState<VeiculoDetalhe | null>(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    buscarOpcoes()
      .then(setDados)
      .catch(() => setErro('Não foi possível carregar os dados do formulário.'));
  }, []);

  // Operador tem centro fixo (o da própria conta) — já entra selecionado.
  useEffect(() => {
    if (!dados || !usuario || usuario.perfil !== 'operador' || !usuario.centroDistribuicaoId) return;
    const centroDoUsuario = dados.centros.find((c) => c.id === usuario.centroDistribuicaoId);
    if (centroDoUsuario) {
      setVeiculo((v) => (v.centro ? v : { ...v, centro: centroDoUsuario }));
    }
  }, [dados, usuario]);

  async function salvar() {
    setErro('');
    setEnviando(true);
    try {
      const resultado = await criarVeiculo(veiculo);
      setCriado(resultado);
    } catch (err) {
      setErro(mensagemDeErro(err, 'Não foi possível salvar o veículo.'));
    } finally {
      setEnviando(false);
    }
  }

  function novoCadastro() {
    setCriado(null);
    setVeiculo((v) =>
      usuario?.perfil === 'operador' ? { ...NOVO_VEICULO_VAZIO, centro: v.centro } : NOVO_VEICULO_VAZIO,
    );
  }

  return (
    <div className="guia">
      <AppHeader
        titulo="Cadastro de Veículo"
        acoes={
          usuario?.perfil === 'admin' && (
            <>
              <Link to="/usuarios" className="app-topo-link">
                Usuários
              </Link>
              <Link to="/centros" className="app-topo-link">
                Centros
              </Link>
              <Link to="/monitoramento" className="app-topo-link">
                Monitoramento
              </Link>
            </>
          )
        }
      />

      {erro && <div className="guia-erro" role="alert">{erro}</div>}
      {!dados && !erro && <div className="guia-carregando">Carregando formulário...</div>}

      {dados && usuario && !criado && (
        <VeiculoWizard
          dados={dados}
          usuario={usuario}
          veiculo={veiculo}
          onChange={setVeiculo}
          onSalvar={salvar}
          enviando={enviando}
        />
      )}

      {criado && <VeiculoConfirmacao veiculo={criado} onNovo={novoCadastro} />}
    </div>
  );
}
