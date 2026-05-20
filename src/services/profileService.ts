import { getSupabase } from "@/lib/supabaseClient";

export type EnsureProfileResult = {
  ok: boolean;
  error?: string;
};

/**
 * Garante registro em public.profiles para auth.uid().
 * Sempre retorna Promise (nunca encadear .catch no retorno de rpc() do Supabase).
 */
export async function ensureProfile(): Promise<EnsureProfileResult> {
  try {
    const { error } = await getSupabase().rpc("ensure_user_profile");
    if (error) {
      if (import.meta.env.DEV) {
        console.warn("[ensureProfile]", error.message);
      }
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Falha ao garantir perfil.";
    if (import.meta.env.DEV) {
      console.warn("[ensureProfile]", message);
    }
    return { ok: false, error: message };
  }
}

export const profileService = {
  ensureProfile,
};
