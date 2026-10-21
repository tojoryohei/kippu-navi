import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/dev",
  timeout: 60_000,
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:3018",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "node scripts/dev-test-api.mjs",
      port: 18080,
      reuseExistingServer: false,
      timeout: 120_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 15_000 },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 3018 --strictPort --ignore-lock",
      url: "http://127.0.0.1:3018",
      reuseExistingServer: false,
      timeout: 180_000,
      gracefulShutdown: { signal: "SIGTERM", timeout: 10_000 },
      env: {
        ASTRO_DEV_BACKGROUND: "1",
        ASTRO_TELEMETRY_DISABLED: "1",
        DEV_API_ORIGIN: "http://127.0.0.1:18080",
        PUBLIC_WASM_VERSION: "",
        PUBLIC_GOOGLE_ANALYTICS_ID: "",
        PUBLIC_POSTHOG_KEY: "",
        PUBLIC_SENTRY_DSN: "",
        SENTRY_AUTH_TOKEN: "",
        SENTRY_ORG: "",
        SENTRY_PROJECT: "",
      },
    },
  ],
});
