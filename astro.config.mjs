import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { loadEnv } from "vite";

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");

export default defineConfig({
  site: "https://kippu-navi.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [react()],
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  server: { host: "0.0.0.0", port: 3000 },
  vite: {
    plugins: [tailwindcss()],
    define: {
      // Classic Workers cannot evaluate import.meta, including during Vite dev.
      __WASM_VERSION__: JSON.stringify(env.PUBLIC_WASM_VERSION || ""),
      // Existing GitHub/local variable names remain usable during migration.
      "import.meta.env.PUBLIC_POSTHOG_KEY": JSON.stringify(
        env.PUBLIC_POSTHOG_KEY || env.NEXT_PUBLIC_POSTHOG_KEY || "",
      ),
      "import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID": JSON.stringify(
        env.PUBLIC_GOOGLE_ANALYTICS_ID ||
          env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ||
          "",
      ),
    },
    server: {
      proxy: {
        "/api": { target: "http://localhost:8080", changeOrigin: true },
        "/ingest/static": {
          target: "https://us-assets.i.posthog.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ingest/, ""),
        },
        "/ingest/array": {
          target: "https://us-assets.i.posthog.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ingest/, ""),
        },
        "/ingest": {
          target: "https://us.i.posthog.com",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ingest/, ""),
        },
      },
    },
  },
});
