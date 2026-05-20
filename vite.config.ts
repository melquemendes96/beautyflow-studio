// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only) [opcional],
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
//
// cloudflare: false — build SSR para Node (VPS + PM2 + Nginx). O mesmo src/server.ts (fetch)
// continua sendo o handler; TanStack Start + srvx fazem o bridge HTTP em produção.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
export default defineConfig({
  cloudflare: false,
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("@supabase")) return "supabase";
            if (id.includes("@tanstack")) return "tanstack";
            if (id.includes("@radix-ui")) return "radix";
            if (id.includes("lucide-react")) return "icons";
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            return "vendor";
          },
        },
      },
    },
  },
});
