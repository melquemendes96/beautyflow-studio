/** Redimensiona imagem no cliente antes do upload (Storage). */
export async function compressImageFile(
  file: File,
  opts: { maxWidth: number; maxHeight: number; quality?: number },
): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") {
    return file;
  }

  const quality = opts.quality ?? 0.85;
  const bitmap = await createImageBitmap(file);
  const ratio = Math.min(opts.maxWidth / bitmap.width, opts.maxHeight / bitmap.height, 1);
  const w = Math.max(1, Math.round(bitmap.width * ratio));
  const h = Math.max(1, Math.round(bitmap.height * ratio));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/webp", quality);
  });
  if (!blob) return file;

  const base = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${base}.webp`, { type: "image/webp" });
}
