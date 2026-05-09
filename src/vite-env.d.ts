/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  /** Chave pública (anon). Alias aceito: VITE_SUPABASE_ANON_KEY */
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string | undefined;
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
  readonly VITE_SUPABASE_PROJECT_ID: string | undefined;
  /** Chave pública Mercado Pago (não confundir com access token). */
  readonly VITE_MERCADO_PAGO_PUBLIC_KEY: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
