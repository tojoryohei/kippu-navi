import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { loadEnv } from "vite";
import packageJson from "./package.json" with { type: "json" };

const env = loadEnv(process.env.NODE_ENV ?? "development", process.cwd(), "");
const deployCommit = process.env.PUBLIC_DEPLOY_COMMIT || process.env.DEPLOY_COMMIT || env.PUBLIC_DEPLOY_COMMIT || "local";
const sentryAuthToken = process.env.SENTRY_AUTH_TOKEN || env.SENTRY_AUTH_TOKEN;
const sentryOrg = process.env.SENTRY_ORG || env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT || env.SENTRY_PROJECT;
const publicSentryDsn = process.env.PUBLIC_SENTRY_DSN || env.PUBLIC_SENTRY_DSN || "";
const sentryDsn = publicSentryDsn ? new URL(publicSentryDsn) : null;
const sentryProjectId = sentryDsn?.pathname.replace(/^\/+|\/+$/g, "");

export default defineConfig({
  site: "https://kippu-navi.com",
  output: "static",
  trailingSlash: "never",
  build: { format: "file" },
  integrations: [react()],
  prefetch: { prefetchAll: true, defaultStrategy: "viewport" },
  server: { host: "0.0.0.0", port: 3000 },
  vite: {
    plugins: [
      tailwindcss(),
      sentryVitePlugin({
        authToken: sentryAuthToken,
        org: sentryOrg,
        project: sentryProject,
        disable: !sentryAuthToken || !sentryOrg || !sentryProject,
        release: { name: `${packageJson.version}+${deployCommit}` },
        sourcemaps: { filesToDeleteAfterUpload: ["dist/**/*.map"] },
      }),
    ],
    define: {
      // Classic Workers cannot evaluate import.meta, including during Vite dev.
      __WASM_VERSION__: JSON.stringify(env.PUBLIC_WASM_VERSION || ""),
      __APP_VERSION__: JSON.stringify(packageJson.version),
      __DEPLOY_COMMIT__: JSON.stringify(deployCommit),
      __DEPLOY_ENVIRONMENT__: JSON.stringify(env.DEPLOY_ENVIRONMENT || "local"),
      "import.meta.env.PUBLIC_POSTHOG_KEY": JSON.stringify(
        env.PUBLIC_POSTHOG_KEY || "",
      ),
      "import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID": JSON.stringify(
        env.PUBLIC_GOOGLE_ANALYTICS_ID || "",
      ),
      "import.meta.env.PUBLIC_SENTRY_DSN": JSON.stringify(
        publicSentryDsn,
      ),
    },
    build: {
      sourcemap: sentryAuthToken ? "hidden" : false,
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
        ...(sentryDsn && sentryProjectId
          ? {
              "/monitoring": {
                target: sentryDsn.origin,
                changeOrigin: true,
                rewrite: () => `/api/${sentryProjectId}/envelope/`,
              },
            }
          : {}),
      },
    },
  },
});
