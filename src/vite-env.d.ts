/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string | undefined;
  /** JWT anon (eyJ...). Única chave usada no cliente. */
  readonly VITE_SUPABASE_ANON_KEY: string | undefined;
  readonly VITE_SUPABASE_PROJECT_ID: string | undefined;
  /** Chave pública Mercado Pago (não confundir com access token). */
  readonly VITE_MERCADO_PAGO_PUBLIC_KEY: string | undefined;
  /** Chave pública VAPID (Web Push). */
  readonly VITE_VAPID_PUBLIC_KEY: string | undefined;
  /** Google Analytics 4 Measurement ID (G-XXXX). */
  readonly VITE_GA4_MEASUREMENT_ID: string | undefined;
  /** Meta (Facebook) Pixel ID. */
  readonly VITE_META_PIXEL_ID: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
