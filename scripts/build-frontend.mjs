import { execFileSync } from "node:child_process";
import { readFileSync, cpSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const run = (file, args, env = process.env) =>
  execFileSync(file, args, { cwd: root, env, stdio: "inherit" });

// ローカルのビルドもCIと同じ4ファイル・内容ハッシュ・配信URLを使う。
run(process.execPath, ["scripts/build-cloudflare-engine.mjs"]);
const version = readFileSync(
  join(root, ".cloudflare-engine/version.txt"),
  "utf8",
).trim();
const env = {
  ...process.env,
  PUBLIC_WASM_VERSION: version,
  PUBLIC_DEPLOY_COMMIT: process.env.DEPLOY_COMMIT || process.env.GITHUB_SHA || "local",
  DEPLOY_ENVIRONMENT: process.env.DEPLOY_ENVIRONMENT || "staging",
  ASTRO_TELEMETRY_DISABLED: "1",
};
run(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], env);
run(process.execPath, ["scripts/package-cloudflare-assets.mjs"], env);

run(process.execPath, ["scripts/build-agent-markdown.mjs"], env);
if (process.env.CI_SOURCEMAPS === "1") {
  // Debug ID注入後のJSを送信・公開し、最後にPWAのハッシュを計算する。
  if (!process.env.SENTRY_CLI_BIN) throw new Error("SENTRY_CLI_BINが必要です");
  run(process.env.SENTRY_CLI_BIN, ["sourcemaps", "inject", "dist/_astro"], env);
  const output = process.env.SENTRY_BUNDLE_DIR;
  if (!output) throw new Error("SENTRY_BUNDLE_DIRが必要です");
  rmSync(output, { recursive: true, force: true });
  mkdirSync(output, { recursive: true });
  for (const name of readdirSync(join(root, "dist/_astro"))) {
    if (!/\.(js|map)$/.test(name)) continue;
    cpSync(join(root, "dist/_astro", name), join(output, name));
    if (name.endsWith(".map")) rmSync(join(root, "dist/_astro", name));
  }
}
run(process.execPath, ["scripts/build-csp.mjs"], env);
run(process.execPath, ["scripts/build-pwa.mjs"], env);
