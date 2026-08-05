import { useState } from "react";

type BrandedImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
  /** Hero / above-the-fold: carrega cedo e com prioridade alta. */
  priority?: boolean;
  sizes?: string;
};

/** Imagem com fallback quando URL quebrada ou Storage indisponível. */
export function BrandedImage({
  src,
  alt,
  className,
  style,
  fallback,
  priority = false,
  sizes,
}: BrandedImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src.trim() || failed) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      style={style}
      sizes={sizes}
      loading={priority ? "eager" : "lazy"}
      decoding={priority ? "sync" : "async"}
      fetchPriority={priority ? "high" : "auto"}
      onError={() => setFailed(true)}
    />
  );
}
