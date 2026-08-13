import { useMemo, useState } from 'react';
import type { Usuario } from '../../types';
import { BrandLogo } from '../../components/BrandLogo';
import { chassiExiste } from '../../services/veiculos.service';
import type { Marca, Modelo, NovoVeiculo, OpcoesFormulario } from './veiculos.types';

interface Props {
  dados: OpcoesFormulario;
  usuario: Usuario;
  veiculo: NovoVeiculo;
  onChange: (v: NovoVeiculo) => void;
  onSalvar: () => void;
  enviando: boolean;
}

const CHASSI_TAMANHO_MINIMO = 5;

function formatarTamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Formulário progressivo de cadastro: cada passo obrigatório só aparece
// quando o anterior foi preenchido — mesmo padrão do wizard de atendimento
// original. Campos opcionais (fotos, vídeo, observações, destino) são
// revelados juntos assim que o chassi é válido, em vez de um a um: nenhum
// deles bloqueia o cadastro, então forçar uma sequência estrita só atrapalharia.
export function VeiculoWizard({ dados, usuario, veiculo, onChange, onSalvar, enviando }: Props) {
  const [filtroModelo, setFiltroModelo] = useState('');
  const [chassiDuplicado, setChassiDuplicado] = useState(false);
  const [verificandoChassi, setVerificandoChassi] = useState(false);
  const [previaVideo, setPreviaVideo] = useState(false);

  const chassiValido = veiculo.chassi.trim().length >= CHASSI_TAMANHO_MINIMO;
  const completo = Boolean(veiculo.marca && chassiValido && !chassiDuplicado);

  const modelosFiltrados = useMemo(() => {
    const lista = veiculo.marca?.modelos ?? [];
    const termo = filtroModelo.trim().toLowerCase();
    return termo ? lista.filter((m) => m.nome.toLowerCase().includes(termo)) : lista;
  }, [veiculo.marca, filtroModelo]);

  // Pré-checagem de duplicidade ao sair do campo — feedback rápido, mas o
  // backend valida de novo no envio (fonte da verdade).
  function verificarChassi(chassi: string) {
    const valor = chassi.trim();
    if (valor.length < CHASSI_TAMANHO_MINIMO) {
      setChassiDuplicado(false);
      return;
    }
    setVerificandoChassi(true);
    chassiExiste(valor)
      .then(setChassiDuplicado)
      .catch(() => setChassiDuplicado(false))
      .finally(() => setVerificandoChassi(false));
  }

  function escolherMarca(m: Marca) {
    onChange({ ...veiculo, marca: m, modelo: null });
    setFiltroModelo('');
  }
  function escolherModelo(m: Modelo) {
    onChange({ ...veiculo, modelo: m });
  }

  function adicionarFotos(arquivos: FileList | null) {
    if (!arquivos) return;
    onChange({ ...veiculo, fotos: [...veiculo.fotos, ...Array.from(arquivos)] });
  }
  function removerFoto(indice: number) {
    onChange({ ...veiculo, fotos: veiculo.fotos.filter((_, i) => i !== indice) });
  }
  function escolherVideo(arquivos: FileList | null) {
    setPreviaVideo(false);
    onChange({ ...veiculo, video: arquivos?.[0] ?? null });
  }

  let passo = 0;
  const numero = () => ++passo;

  return (
    <div className="wizard">
      <div className="wizard-marca">
        <h1 className="wizard-marca-nome">{usuario.nome}</h1>
        <p className="wizard-marca-sub">Preencha os dados para registrar o veículo</p>
      </div>

      <div className="wizard-card">
        <section className="wizard-passo">
          <div className="guia-passo-cab">
            <span className="guia-passo-num">{numero()}</span> MARCA
          </div>
          <div className="marca-grade">
            {dados.marcas.map((m) => (
              <button
                key={m.id}
                className={`chip chip-marca ${veiculo.marca?.id === m.id ? 'chip-ativo' : ''}`}
                onClick={() => escolherMarca(m)}
                aria-label={m.nome}
                title={m.nome}
              >
                <BrandLogo marca={m.nome} size={52} className="marca-logo" />
              </button>
            ))}
          </div>
        </section>

        {veiculo.marca && (
          <section className="wizard-passo">
            <div className="guia-passo-cab">
              <span className="guia-passo-num">{numero()}</span> MODELO
            </div>
            {veiculo.marca.modelos.length === 0 ? (
              <p className="guia-hint">
                Nenhum modelo cadastrado para esta marca ainda — pode prosseguir sem selecionar.
              </p>
            ) : (
              <>
                <input
                  className="guia-busca-modelo"
                  placeholder="Buscar modelo..."
                  value={filtroModelo}
                  onChange={(e) => setFiltroModelo(e.target.value)}
                />
                <div className="guia-chips guia-chips-scroll">
                  {modelosFiltrados.length === 0 ? (
                    <span className="guia-hint">Nenhum modelo encontrado.</span>
                  ) : (
                    modelosFiltrados.map((m) => (
                      <button
                        key={m.id}
                        className={`chip ${veiculo.modelo?.id === m.id ? 'chip-ativo' : ''}`}
                        onClick={() => escolherModelo(m)}
                      >
                        <span>{m.nome}</span>
                      </button>
                    ))
                  )}
                </div>
              </>
            )}
          </section>
        )}

        {veiculo.marca && (
          <section className="wizard-passo">
            <div className="guia-passo-cab">
              <span className="guia-passo-num">{numero()}</span> CHASSI
            </div>
            <input
              className="wizard-cliente"
              placeholder="Número do chassi..."
              value={veiculo.chassi}
              onChange={(e) => {
                const valor = e.target.value.toUpperCase();
                onChange({ ...veiculo, chassi: valor });
                setChassiDuplicado(false);
              }}
              onBlur={(e) => verificarChassi(e.target.value)}
              autoCapitalize="characters"
              spellCheck={false}
              autoComplete="off"
            />
            {verificandoChassi && <p className="guia-hint">Verificando chassi...</p>}
            {chassiDuplicado && (
              <p className="erro" role="alert">
                Já existe um veículo cadastrado com este chassi.
              </p>
            )}
          </section>
        )}

        {veiculo.marca && chassiValido && (
          <section className="wizard-passo">
            <div className="guia-passo-cab">
              <span className="guia-passo-num">{numero()}</span> FOTOS
            </div>
            <label className="btn btn-secundario veiculo-upload-btn">
              Incluir fotos
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={(e) => adicionarFotos(e.target.files)}
                hidden
              />
            </label>
            {veiculo.fotos.length > 0 && (
              <div className="veiculo-fotos-grid">
                {veiculo.fotos.map((foto, i) => (
                  <div className="veiculo-foto-thumb" key={`${foto.name}-${i}`}>
                    <img src={URL.createObjectURL(foto)} alt={`Foto ${i + 1}`} />
                    <button
                      type="button"
                      className="veiculo-foto-remover"
                      onClick={() => removerFoto(i)}
                      aria-label={`Remover foto ${i + 1}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="guia-passo-cab veiculo-secao">
              <span className="guia-passo-num">{numero()}</span> VÍDEO
            </div>
            <label className="btn btn-secundario veiculo-upload-btn">
              {veiculo.video ? 'Trocar vídeo' : 'Incluir vídeo'}
              <input
                type="file"
                accept="video/mp4,video/webm,video/quicktime"
                onChange={(e) => escolherVideo(e.target.files)}
                hidden
              />
            </label>
            {veiculo.video && (
              <div className="veiculo-video-preview">
                <span>
                  {veiculo.video.name} · {formatarTamanho(veiculo.video.size)}
                </span>
                {!previaVideo ? (
                  <button type="button" className="btn btn-secundario" onClick={() => setPreviaVideo(true)}>
                    Pré-visualizar
                  </button>
                ) : (
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video controls src={URL.createObjectURL(veiculo.video)} className="veiculo-video-tag" />
                )}
              </div>
            )}

            <div className="guia-passo-cab veiculo-secao">
              <span className="guia-passo-num">{numero()}</span> OBSERVAÇÕES
            </div>
            <textarea
              className="wizard-select veiculo-textarea"
              placeholder="Observações sobre o veículo (opcional)..."
              value={veiculo.observacoes}
              onChange={(e) => onChange({ ...veiculo, observacoes: e.target.value })}
              rows={3}
            />

            <div className="guia-passo-cab veiculo-secao">
              <span className="guia-passo-num">{numero()}</span> DESTINO
            </div>
            <input
              className="wizard-cliente"
              placeholder="Concessionária de destino (opcional)..."
              value={veiculo.destino}
              onChange={(e) => onChange({ ...veiculo, destino: e.target.value })}
            />
          </section>
        )}
      </div>

      {completo && (
        <div className="wizard-acao">
          <button className="btn btn-primario btn-bloco btn-gerar" onClick={onSalvar} disabled={enviando}>
            {enviando ? 'Salvando...' : 'Salvar veículo →'}
          </button>
        </div>
      )}
    </div>
  );
}
