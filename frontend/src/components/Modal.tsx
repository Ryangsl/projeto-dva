import { useEffect, useId, useRef, type ReactNode } from 'react';
import './Modal.css';

interface Props {
  titulo: string;
  onFechar: () => void;
  children: ReactNode;
  // Modais com mais conteúdo (ex.: detalhe do veículo) podem pedir uma
  // largura maior que o padrão de 380px — ver .usuarios-modal-largo.
  className?: string;
}

// Modal acessível, reaproveitado pelas caixas de diálogo do módulo `usuarios`.
// Mantém as MESMAS classes CSS que já existiam (usuarios-modal*), então o visual
// não muda — o que entra é o comportamento que faltava:
//
//  - role="dialog" + aria-modal + aria-labelledby: leitores de tela anunciam
//    como diálogo e leem o título, em vez de ler o conteúdo da página atrás;
//  - Escape fecha (era só clique no fundo, inalcançável por teclado);
//  - foco vai para o diálogo ao abrir e VOLTA para o elemento anterior ao
//    fechar — sem isso, o foco do teclado continua atrás do overlay;
//  - scroll do body travado enquanto aberto. No celular/tablet isso é o mais
//    perceptível: sem trava, arrastar sobre o overlay rola a lista por baixo e
//    o diálogo parece "solto" na tela.
export function Modal({ titulo, onFechar, children, className }: Props) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  useEffect(() => {
    const focoAnterior = document.activeElement as HTMLElement | null;
    caixaRef.current?.focus();

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', aoTeclar);

    // Preserva o valor original em vez de assumir '' — outra tela pode ter
    // definido um overflow próprio.
    const overflowOriginal = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = overflowOriginal;
      focoAnterior?.focus();
    };
  }, [onFechar]);

  return (
    <div className="usuarios-modal-fundo" onClick={onFechar}>
      <div
        ref={caixaRef}
        className={`card usuarios-modal ${className ?? ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="usuarios-modal-titulo" id={tituloId}>
          {titulo}
        </h2>
        {children}
      </div>
    </div>
  );
}
