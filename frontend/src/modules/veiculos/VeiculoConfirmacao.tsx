import { useState } from 'react';
import { Lightbox } from '../../components/Lightbox';
import { FotoComFallback, VideoComFallback } from '../../components/MidiaComFallback';
import { urlMidia } from '../../services/veiculos.service';
import type { VeiculoDetalhe } from './veiculos.types';

interface Props {
  veiculo: VeiculoDetalhe;
  onNovo: () => void;
}

// Tela pós-cadastro: confirmação simples + resumo do que foi salvo. Sem
// roteiro/ofertas (isso era específico do antigo Guia de Atendimento) — só o
// registro do veículo, que já está gravado no banco a essa altura.
export function VeiculoConfirmacao({ veiculo, onNovo }: Props) {
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  const urlsFotos = veiculo.fotos.map(urlMidia);

  return (
    <div className="guia-resultado">
      <div className="atendimento-capa-wrap">
        <div className="atendimento-capa">
          <div className="atendimento-info">
            <span className="atendimento-rotulo">Veículo cadastrado</span>
            <h1 className="atendimento-cliente">{veiculo.chassi}</h1>
            <p className="veiculo-protocolo">
              Protocolo: <strong>{veiculo.protocolo}</strong>
            </p>
            <div className="atendimento-veiculo">
              <span className="atendimento-tag">{veiculo.marcaNome}</span>
              {veiculo.modeloNome && <span className="atendimento-tag">{veiculo.modeloNome}</span>}
              {veiculo.corNome && (
                <span className="atendimento-tag">
                  <span
                    className="cor-bola-mini"
                    style={{ background: veiculo.corHex ?? '#ccc', borderRadius: '50%' }}
                  />
                  {veiculo.corNome}
                </span>
              )}
              <span className="atendimento-tag">{veiculo.centroNome}</span>
              {veiculo.destino && <span className="atendimento-tag">Destino: {veiculo.destino}</span>}
            </div>
          </div>
          <div className="atendimento-acoes">
            <button className="btn btn-primario btn-novo" onClick={onNovo}>
              + Novo veículo
            </button>
          </div>
        </div>
      </div>

      <div className="guia-conteudo">
        {veiculo.observacoes && (
          <div className="card veiculo-bloco">
            <h2 className="guia-col-titulo">Observações</h2>
            <p className="roteiro-instrucao">{veiculo.observacoes}</p>
          </div>
        )}

        {urlsFotos.length > 0 && (
          <div className="card veiculo-bloco">
            <h2 className="guia-col-titulo">Fotos</h2>
            <div className="veiculo-fotos-grid">
              {urlsFotos.map((url, i) => (
                <FotoComFallback
                  key={url}
                  src={url}
                  alt={`Foto ${i + 1} de ${veiculo.chassi}`}
                  onClick={() => setFotoAberta(i)}
                />
              ))}
            </div>
          </div>
        )}

        {veiculo.videoUrl && (
          <div className="card veiculo-bloco">
            <h2 className="guia-col-titulo">Vídeo</h2>
            <VideoComFallback src={urlMidia(veiculo.videoUrl)} />
          </div>
        )}
      </div>

      <div className="guia-rodape">
        <button className="btn btn-primario btn-novo-rodape" onClick={onNovo}>
          Cadastrar outro veículo
        </button>
      </div>

      {fotoAberta !== null && (
        <Lightbox
          imagens={urlsFotos}
          indice={fotoAberta}
          onFechar={() => setFotoAberta(null)}
          onNavegar={setFotoAberta}
        />
      )}
    </div>
  );
}
