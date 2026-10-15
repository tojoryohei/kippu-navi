import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const directory = mkdtempSync(join(tmpdir(), "kippu-navi-dev-api-"));
const binary = join(directory, process.platform === "win32" ? "api.exe" : "api");
process.on("exit", () => rmSync(directory, { recursive: true, force: true }));
const dataDirectory = join(directory, "data");
mkdirSync(dataDirectory);

// go runの子プロセスを残さず、テスト終了時にAPI自体を停止できるようにする。
execFileSync("go", ["build", "-o", binary, "./cmd/api"], {
  cwd: join(root, "calculation-engine"),
  stdio: "inherit",
});
const child = spawn(binary, [], {
  cwd: join(root, "calculation-engine"),
  stdio: "inherit",
  env: { ...process.env, PORT: "18080", PRECOMPUTED_DATA_DIR: dataDirectory },
});
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("error", error => {
  console.error(error);
  process.exitCode = 1;
});
child.on("close", code => { process.exitCode = code ?? 1; });
