import { getSupabase } from "@/lib/supabaseClient";
import { compressImageFile } from "@/lib/image-compress";

export const COMPANY_MEDIA_BUCKET = "company-media";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);
const MAX_RETRIES = 2;

function safeExt(filename: string): string {
  const raw = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "jpg";
  return ALLOWED_EXT.has(raw) ? raw : "jpg";
}

async function removeStaleKindFiles(companyId: string, kind: "logo" | "banner", keepPath: string) {
  const supabase = getSupabase();
  const prefix = `${companyId}/`;
  const { data: listed } = await supabase.storage.from(COMPANY_MEDIA_BUCKET).list(companyId, {
    limit: 20,
  });
  if (!listed?.length) return;

  const stale = listed
    .filter((f) => f.name?.startsWith(`${kind}.`) && `${prefix}${f.name}` !== keepPath)
    .map((f) => `${prefix}${f.name}`);

  if (stale.length > 0) {
    await supabase.storage.from(COMPANY_MEDIA_BUCKET).remove(stale);
  }
}

/**
 * Envia imagem para Storage (`company-media/{companyId}/logo|banner.ext`) com compressão e retry.
 */
export async function uploadCompanyImage(
  companyId: string,
  kind: "logo" | "banner" | "service",
  file: File,
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const supabase = getSupabase();

  const compressed =
    kind === "logo"
      ? await compressImageFile(file, { maxWidth: 512, maxHeight: 512, quality: 0.88 })
      : kind === "banner"
        ? await compressImageFile(file, { maxWidth: 1920, maxHeight: 1080, quality: 0.85 })
        : await compressImageFile(file, { maxWidth: 1200, maxHeight: 1200, quality: 0.85 });

  const ext = compressed.type === "image/webp" ? "webp" : safeExt(compressed.name);
  const objectPath =
    kind === "service"
      ? `${companyId}/services/${crypto.randomUUID()}.${ext}`
      : `${companyId}/${kind}.${ext}`;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const { error } = await supabase.storage.from(COMPANY_MEDIA_BUCKET).upload(objectPath, compressed, {
      cacheControl: "3600",
      upsert: true,
      contentType: compressed.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
    });

    if (!error) {
      if (kind === "logo" || kind === "banner") {
        await removeStaleKindFiles(companyId, kind, objectPath);
      }
      const { data } = supabase.storage.from(COMPANY_MEDIA_BUCKET).getPublicUrl(objectPath);
      const cacheBust = `${data.publicUrl}${data.publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
      return { publicUrl: cacheBust, error: null };
    }

    lastError = new Error(error.message);
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  return { publicUrl: null, error: lastError };
}
