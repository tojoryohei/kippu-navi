import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: "http://localhost:4321",
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    trace: "retain-on-failure",
  },
  webServer: {
    // ハッシュ付きエンジン資材とPWA保存一覧まで生成してから配信する。
    command: "npm run build && node scripts/preview-pwa.mjs",
    url: "http://localhost:4321",
    // 別ビルドを配信する既存サーバーで誤って検証しない。
    reuseExistingServer: false,
    timeout: 180_000,
    env: { ASTRO_TELEMETRY_DISABLED: "1", ASTRO_PREVIEW_BACKGROUND: "1" },
  },
});
