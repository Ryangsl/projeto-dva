import { useState } from 'react';
import { Lightbox } from '../../components/Lightbox';
import { Modal } from '../../components/Modal';
import { FotoComFallback, VideoComFallback } from '../../components/MidiaComFallback';
import { urlMidia } from '../../services/veiculos.service';
import type { VeiculoDetalhe } from '../veiculos/veiculos.types';

interface Props {
  veiculo: VeiculoDetalhe;
  onFechar: () => void;
  // Excluir é restrito ao Admin — a lista de veículos (que sabe o perfil de
  // quem está logado) decide se mostra o botão e o que fazer ao clicar.
  souAdmin?: boolean;
  onExcluir?: () => void;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function VeiculoDetalheModal({ veiculo, onFechar, souAdmin, onExcluir }: Props) {
  const [fotoAberta, setFotoAberta] = useState<number | null>(null);
  const urlsFotos = veiculo.fotos.map(urlMidia);

  return (
    <>
      <Modal titulo={`Veículo ${veiculo.chassi}`} onFechar={onFechar} className="usuarios-modal-largo">
        <div className="veiculo-detalhe-campos">
          <div>
            <span className="atendimento-rotulo">Protocolo</span>
            <p className="veiculo-protocolo-valor">{veiculo.protocolo}</p>
          </div>
          <div>
            <span className="atendimento-rotulo">Marca</span>
            <p>{veiculo.marcaNome}</p>
          </div>
          <div>
            <span className="atendimento-rotulo">Modelo</span>
            <p>{veiculo.modeloNome ?? '—'}</p>
          </div>
          <div>
            <span className="atendimento-rotulo">Destino</span>
            <p>{veiculo.destino ?? '—'}</p>
          </div>
          <div>
            <span className="atendimento-rotulo">Cadastrado por</span>
            <p>
              {veiculo.usuarioNome} em {formatarData(veiculo.criadoEm)}
            </p>
          </div>
        </div>

        {veiculo.observacoes && (
          <div className="veiculo-detalhe-obs">
            <span className="atendimento-rotulo">Observações</span>
            <p className="roteiro-instrucao">{veiculo.observacoes}</p>
          </div>
        )}

        <div className="veiculo-detalhe-secao">
          <span className="atendimento-rotulo">Fotos</span>
          {urlsFotos.length > 0 ? (
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
          ) : (
            <p className="guia-hint">Nenhuma foto disponível.</p>
          )}
        </div>

        <div className="veiculo-detalhe-secao">
          <span className="atendimento-rotulo">Vídeo</span>
          {veiculo.videoUrl ? (
            <VideoComFallback src={urlMidia(veiculo.videoUrl)} />
          ) : (
            <p className="guia-hint">Nenhum vídeo disponível.</p>
          )}
        </div>

        <div className="veiculo-detalhe-rodape">
          <button className="btn btn-primario btn-bloco" onClick={onFechar}>
            Fechar
          </button>
          {souAdmin && onExcluir && (
            <button className="btn btn-perigo btn-bloco" onClick={onExcluir}>
              Excluir veículo
            </button>
          )}
        </div>
      </Modal>

      {fotoAberta !== null && (
        <Lightbox
          imagens={urlsFotos}
          indice={fotoAberta}
          onFechar={() => setFotoAberta(null)}
          onNavegar={setFotoAberta}
        />
      )}
    </>
  );
}
