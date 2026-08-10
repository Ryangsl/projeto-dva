import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { AppHeader } from '../../components/AppHeader';
import { buscarGuia, lerGuiaCache } from '../../services/guia.service';
import {
  gerarUuid,
  metadadosDoAtendimento,
  registrarConclusao,
  registrarInicio,
} from '../../services/monitoramento.service';
import { AtendimentoWizard } from './AtendimentoWizard';
import { GuiaAtendimento } from './GuiaAtendimento';
import { ATENDIMENTO_VAZIO, type Atendimento, type GuiaDados } from './guia.types';
import './guia.css';

// Orquestra as duas telas do atendimento:
//  1. Wizard — o consultor preenche cliente + veículo passo a passo;
//  2. Guia — roteiro e ofertas gerados para aquele cliente, naquele momento.
// Nada é gravado no banco: o atendimento vive só em memória.
export function GuiaPage() {
  const { usuario } = useAuth();
  const [dados, setDados] = useState<GuiaDados | null>(null);
  const [erro, setErro] = useState('');
  const [atendimento, setAtendimento] = useState<Atendimento>(ATENDIMENTO_VAZIO);
  const [fase, setFase] = useState<'wizard' | 'guia'>('wizard');

  // Monitoramento de uso (auditoria, sem PII): geramos um uuid por atendimento e
  // registramos o INÍCIO na primeira interação real do wizard e a CONCLUSÃO quando
  // o consultor efetivamente conclui o atendimento (botão de concluir/novo) — não
  // ao gerar o manual. Os registros são fire-and-forget (não afetam o offline-first).
  const uuidRef = useRef<string | null>(null);
  const iniciadoRef = useRef(false);

  // Interceptor do onChange do wizard: dispara o "iniciar" assim que o consultor
  // fornece o primeiro dado significativo (nome do cliente ou modelo).
  const aoMudarAtendimento = useCallback((proximo: Atendimento) => {
    setAtendimento(proximo);
    const comecou = proximo.cliente.trim().length > 0 || proximo.modelo !== null;
    if (!iniciadoRef.current && comecou) {
      iniciadoRef.current = true;
      uuidRef.current = gerarUuid();
      registrarInicio(uuidRef.current, metadadosDoAtendimento(proximo));
    }
  }, []);

  // Gerar o manual apenas avança de tela: é o início do uso do guia, não a
  // conclusão do atendimento (que é contabilizada em novoAtendimento).
  const gerarGuia = useCallback(() => setFase('guia'), []);

  // Stale-while-revalidate: mostra o cache na hora (rápido/offline) e revalida
  // da rede em segundo plano, trocando pelos dados atuais quando chegarem.
  useEffect(() => {
    if (!usuario) return;
    const cache = lerGuiaCache(usuario.id);
    if (cache) setDados(cache);

    buscarGuia(usuario.id)
      .then((frescos) => {
        setDados(frescos);
        // Só descarta a seleção se o fabricante escolhido sumiu dos dados novos.
        setAtendimento((a) =>
          a.fabricante && !frescos.fabricantes.some((f) => f.id === a.fabricante?.id)
            ? { ...ATENDIMENTO_VAZIO, cliente: a.cliente }
            : a,
        );
      })
      .catch(() => {
        if (!cache) setErro('Não foi possível carregar o guia. Conecte-se uma vez para baixá-lo.');
      });
  }, [usuario]);

  // Concessionária tem uma única marca: já entra selecionada no atendimento.
  useEffect(() => {
    if (dados?.fabricantes.length === 1) {
      setAtendimento((a) => (a.fabricante ? a : { ...a, fabricante: dados.fabricantes[0] }));
    }
  }, [dados]);

  function novoAtendimento() {
    // Conclusão contabilizada aqui: o consultor concluiu o atendimento atual
    // (botão "Concluir e iniciar novo atendimento" / "+ Novo atendimento").
    if (uuidRef.current) {
      registrarConclusao(uuidRef.current, metadadosDoAtendimento(atendimento));
    }
    // Novo atendimento = novo uuid; zera o controle de "iniciado".
    uuidRef.current = null;
    iniciadoRef.current = false;
    setAtendimento(
      dados?.fabricantes.length === 1
        ? { ...ATENDIMENTO_VAZIO, fabricante: dados.fabricantes[0] }
        : ATENDIMENTO_VAZIO,
    );
    setFase('wizard');
  }

  return (
    <div className="guia">
      <AppHeader
        titulo="Manual de Vendas Digital"
        acoes={
          (usuario?.perfil === 'gestor' || usuario?.perfil === 'admin') && (
            <>
              <Link to="/usuarios" className="app-topo-link">
                Usuários
              </Link>
              <Link to="/gestor/uso" className="app-topo-link">
                Monitoramento
              </Link>
            </>
          )
        }
      />

      {erro && <div className="guia-erro">{erro}</div>}
      {!dados && !erro && <div className="guia-carregando">Carregando guia...</div>}

      {dados && usuario && fase === 'wizard' && (
        <AtendimentoWizard
          dados={dados}
          usuario={usuario}
          atendimento={atendimento}
          onChange={aoMudarAtendimento}
          onGerar={gerarGuia}
        />
      )}

      {dados && fase === 'guia' && (
        <GuiaAtendimento dados={dados} atendimento={atendimento} onNovo={novoAtendimento} />
      )}
    </div>
  );
}
