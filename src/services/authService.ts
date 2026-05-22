import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getAuthCallbackUrl, getPasswordResetRedirectUrl } from "@/lib/auth-url";
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

  signInWithGoogle(redirectTo?: string) {
    const target = redirectTo?.trim() || getAuthCallbackUrl();
    return getSupabase().auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: target,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
  },

  signInWithPassword(email: string, password: string) {
    return getSupabase().auth.signInWithPassword({ email, password });
  },

  resetPasswordForEmail(email: string) {
    return getSupabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getPasswordResetRedirectUrl(),
    });
  },

  updatePassword(newPassword: string) {
    return getSupabase().auth.updateUser({ password: newPassword });
  },

  signOut() {
    return getSupabase().auth.signOut();
  },

  updateCompanyNameMetadata(companyName: string) {
    const name = companyName.trim();
    if (name.length < 2) return Promise.resolve({ data: { user: null }, error: null });
    return getSupabase().auth.updateUser({ data: { company_name: name } });
  },

  onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void) {
    return getSupabase().auth.onAuthStateChange(callback);
  },
};
