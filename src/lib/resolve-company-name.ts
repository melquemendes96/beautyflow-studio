import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";
import { readOAuthFlowContext, readStudioNameFromUrl } from "@/lib/oauth-signup-intent";

/** Nome do studio gravado no signUp (`authService.signUpWithPassword` → user_metadata.company_name). */
export function companyNameFromUserMetadata(user: User | null | undefined): string | null {
  if (!user?.user_metadata || typeof user.user_metadata !== "object") return null;
  const meta = user.user_metadata as Record<string, unknown>;
  const raw = meta.company_name ?? meta.companyName;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length >= 2 ? trimmed : null;
}

/** Prioriza formulário → OAuth context → URL → metadata do usuário. */
export async function resolveCompanyNameForBootstrap(explicit?: string | null): Promise<string | null> {
  const fromForm = explicit?.trim();
  if (fromForm && fromForm.length >= 2) return fromForm;

  const ctx = readOAuthFlowContext();
  if (ctx?.companyName && ctx.companyName.trim().length >= 2) return ctx.companyName.trim();

  const fromUrl = readStudioNameFromUrl();
  if (fromUrl) return fromUrl;

  const { data } = await getSupabase().auth.getUser();
  return companyNameFromUserMetadata(data.user ?? null);
}
