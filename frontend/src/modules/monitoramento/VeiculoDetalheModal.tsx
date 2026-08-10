import { Modal } from '../../components/Modal';
import { FotoComFallback, VideoComFallback } from '../../components/MidiaComFallback';
import { urlMidia } from '../../services/veiculos.service';
import type { VeiculoDetalhe } from '../veiculos/veiculos.types';

interface Props {
  veiculo: VeiculoDetalhe;
  onFechar: () => void;
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR');
}

export function VeiculoDetalheModal({ veiculo, onFechar }: Props) {
  return (
    <Modal titulo={`Veículo ${veiculo.chassi}`} onFechar={onFechar}>
      <div className="veiculo-detalhe-campos">
        <div>
          <span className="atendimento-rotulo">Marca</span>
          <p>{veiculo.marcaNome}</p>
        </div>
        <div>
          <span className="atendimento-rotulo">Modelo</span>
          <p>{veiculo.modeloNome ?? '—'}</p>
        </div>
        <div>
          <span className="atendimento-rotulo">Cor</span>
          <p>{veiculo.corNome ?? '—'}</p>
        </div>
        <div>
          <span className="atendimento-rotulo">Centro de distribuição</span>
          <p>{veiculo.centroNome}</p>
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
        {veiculo.fotos.length > 0 ? (
          <div className="veiculo-fotos-grid">
            {veiculo.fotos.map((foto) => (
              <FotoComFallback key={foto} src={urlMidia(foto)} alt={`Foto de ${veiculo.chassi}`} />
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

      <button className="btn btn-primario btn-bloco" onClick={onFechar}>
        Fechar
      </button>
    </Modal>
  );
}
