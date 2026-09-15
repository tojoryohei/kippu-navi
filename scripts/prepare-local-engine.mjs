import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
execFileSync(process.execPath, ["scripts/build-cloudflare-engine.mjs"], {
  cwd: root,
  stdio: "inherit",
});
const version = readFileSync(
  join(root, ".cloudflare-engine/version.txt"),
  "utf8",
).trim();
const destination = join(root, "public/engine");
mkdirSync(destination, { recursive: true });
for (const file of [
  "main.wasm",
  "wasm_exec.js",
  "pass_graph_data.bin",
  "ticket_graph_data.bin",
]) {
  copyFileSync(
    join(root, ".cloudflare-engine", version, file),
    join(destination, file),
  );
}
console.log("Prepared local WASM and graph data at /engine/");
