import type { User } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";

/** Nome do studio gravado no signUp (`authService.signUpWithPassword` → user_metadata.company_name). */
export function companyNameFromUserMetadata(user: User | null | undefined): string | null {
  if (!user?.user_metadata || typeof user.user_metadata !== "object") return null;
  const meta = user.user_metadata as Record<string, unknown>;
  const raw = meta.company_name ?? meta.companyName;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length >= 2 ? trimmed : null;
}

/** Prioriza o nome do formulário; senão lê o metadata do usuário autenticado. */
export async function resolveCompanyNameForBootstrap(explicit?: string | null): Promise<string | null> {
  const fromForm = explicit?.trim();
  if (fromForm && fromForm.length >= 2) return fromForm;

  const { data } = await getSupabase().auth.getUser();
  return companyNameFromUserMetadata(data.user ?? null);
}
