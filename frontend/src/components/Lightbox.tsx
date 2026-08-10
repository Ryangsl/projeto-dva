import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  imagens: string[];
  indice: number;
  onFechar: () => void;
  onNavegar: (novoIndice: number) => void;
}

// Visualização ampliada de uma foto, com navegação entre as demais fotos do
// mesmo veículo (podem ser várias — fotos externas tiradas no centro de
// distribuição). Por padrão a foto fica num quadro contido (não cobre a tela
// toda) — um botão dentro da própria imagem alterna para tela cheia. Mesmo
// padrão de acessibilidade do Modal: Escape fecha, foco vai para o diálogo ao
// abrir e volta ao elemento anterior ao fechar, scroll do body travado.
// Setas do teclado navegam quando há mais de uma foto.
export function Lightbox({ imagens, indice, onFechar, onNavegar }: Props) {
  const total = imagens.length;
  const fecharRef = useRef<HTMLButtonElement>(null);
  const [expandido, setExpandido] = useState(false);

  const anterior = useCallback(() => onNavegar((indice - 1 + total) % total), [indice, total, onNavegar]);
  const proxima = useCallback(() => onNavegar((indice + 1) % total), [indice, total, onNavegar]);

  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null;
    fecharRef.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
      else if (e.key === 'ArrowLeft' && total > 1) anterior();
      else if (e.key === 'ArrowRight' && total > 1) proxima();
    };
    document.addEventListener('keydown', aoTeclar);

    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowOriginal;
      focoAnterior?.focus();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onFechar]);

  return (
    <div
      className="lightbox-fundo"
      onClick={onFechar}
      role="dialog"
      aria-modal="true"
      aria-label="Visualização da foto"
    >
      <button ref={fecharRef} className="lightbox-fechar" onClick={onFechar} aria-label="Fechar">
        ×
      </button>

      {total > 1 && (
        <button
          className="lightbox-nav lightbox-nav-anterior"
          onClick={(e) => {
            e.stopPropagation();
            anterior();
          }}
          aria-label="Foto anterior"
        >
          ‹
        </button>
      )}

      {/* Quadro contido por padrão — o botão de expandir (dentro da própria
          imagem) alterna para o tamanho máximo, em vez de a foto já abrir
          ocupando a tela inteira. */}
      <div className="lightbox-quadro" onClick={(e) => e.stopPropagation()}>
        <img
          src={imagens[indice]}
          alt={`Foto ${indice + 1} de ${total}`}
          className={`lightbox-imagem ${expandido ? 'lightbox-imagem-expandida' : ''}`}
        />
        <button
          className="lightbox-expandir"
          onClick={() => setExpandido((v) => !v)}
          aria-label={expandido ? 'Reduzir imagem' : 'Expandir imagem'}
          title={expandido ? 'Reduzir' : 'Expandir'}
        >
          {expandido ? '⤡' : '⤢'}
        </button>
      </div>

      {total > 1 && (
        <button
          className="lightbox-nav lightbox-nav-proxima"
          onClick={(e) => {
            e.stopPropagation();
            proxima();
          }}
          aria-label="Próxima foto"
        >
          ›
        </button>
      )}

      {total > 1 && (
        <div className="lightbox-contador">
          {indice + 1} / {total}
        </div>
      )}
    </div>
  );
}
