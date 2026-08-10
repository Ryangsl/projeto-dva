import { useState } from 'react';

// Miniatura de foto com fallback: se o arquivo não carregar (removido do
// disco, erro de rede, etc.), mostra um estado visual em vez do ícone de
// imagem quebrada nativo do navegador. `onClick`, quando informado, torna a
// miniatura um botão (abre o Lightbox na tela que a usa).
export function FotoComFallback({
  src,
  alt,
  onClick,
}: {
  src: string;
  alt: string;
  onClick?: () => void;
}) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <div className="veiculo-foto-thumb veiculo-midia-indisponivel">
        <span>Foto indisponível</span>
      </div>
    );
  }
  if (onClick) {
    return (
      <button type="button" className="veiculo-foto-thumb veiculo-foto-thumb-clicavel" onClick={onClick}>
        <img src={src} alt={alt} onError={() => setFalhou(true)} />
      </button>
    );
  }
  return (
    <div className="veiculo-foto-thumb">
      <img src={src} alt={alt} onError={() => setFalhou(true)} />
    </div>
  );
}

export function VideoComFallback({ src }: { src: string }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <div className="veiculo-midia-indisponivel veiculo-video-tag">
        <span>Vídeo indisponível</span>
      </div>
    );
  }
  return (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      controls
      preload="metadata"
      src={src}
      className="veiculo-video-tag"
      onError={() => setFalhou(true)}
    />
  );
}
