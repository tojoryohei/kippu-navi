import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
  DEPLOY_ENVIRONMENT: process.env.DEPLOY_ENVIRONMENT || "staging",
  ASTRO_TELEMETRY_DISABLED: "1",
};
run(process.execPath, ["node_modules/astro/bin/astro.mjs", "build"], env);
run(process.execPath, ["scripts/package-cloudflare-assets.mjs"], env);
