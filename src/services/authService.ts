import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabaseClient";

/**
 * Autenticação via Supabase Auth (email/senha e fluxos futuros).
 */
export const authService = {
  getSession() {
    return getSupabase().auth.getSession();
  },

  signUpWithPassword(
    email: string,
    password: string,
    options?: {
      companyName?: string | null;
      emailRedirectTo?: string;
    },
  ) {
    const name = options?.companyName?.trim();
    return getSupabase().auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: options?.emailRedirectTo,
        data: name ? { company_name: name } : undefined,
      },
    });
  },

  signInWithGoogle(redirectTo: string) {
    return getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  },

  signInWithPassword(email: string, password: string) {
    return getSupabase().auth.signInWithPassword({ email, password });
  },

  signOut() {
    return getSupabase().auth.signOut();
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return getSupabase().auth.onAuthStateChange(callback);
  },
};
