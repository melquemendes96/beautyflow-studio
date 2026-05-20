import { useState } from "react";

type BrandedImageProps = {
  src: string;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
};

/** Imagem com fallback quando URL quebrada ou Storage indisponível. */
export function BrandedImage({ src, alt, className, style, fallback }: BrandedImageProps) {
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
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
