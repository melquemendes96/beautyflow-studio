import { getSupabase } from "@/lib/supabaseClient";

export const COMPANY_MEDIA_BUCKET = "company-media";

const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif"]);

function safeExt(filename: string): string {
  const raw = filename.includes(".") ? filename.split(".").pop()!.toLowerCase() : "jpg";
  return ALLOWED_EXT.has(raw) ? raw : "jpg";
}

/**
 * Envia imagem para Storage (`company-media/{companyId}/...`) e devolve URL pública.
 */
export async function uploadCompanyImage(
  companyId: string,
  kind: "logo" | "banner" | "service",
  file: File,
): Promise<{ publicUrl: string | null; error: Error | null }> {
  const supabase = getSupabase();
  const ext = safeExt(file.name);
  const objectPath =
    kind === "service"
      ? `${companyId}/services/${crypto.randomUUID()}.${ext}`
      : `${companyId}/${kind}.${ext}`;

  const { error } = await supabase.storage.from(COMPANY_MEDIA_BUCKET).upload(objectPath, file, {
    cacheControl: "3600",
    upsert: true,
    contentType: file.type || `image/${ext === "jpg" ? "jpeg" : ext}`,
  });

  if (error) {
    return { publicUrl: null, error: new Error(error.message) };
  }

  const { data } = supabase.storage.from(COMPANY_MEDIA_BUCKET).getPublicUrl(objectPath);
  return { publicUrl: data.publicUrl, error: null };
}
