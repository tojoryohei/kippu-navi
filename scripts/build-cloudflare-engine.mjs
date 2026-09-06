import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const engine = join(root, 'calculation-engine');
const outputRoot = join(root, '.cloudflare-engine');
const staging = join(outputRoot, 'staging');
const files = ['main.wasm', 'pass_graph_data.bin', 'ticket_graph_data.bin', 'wasm_exec.js'];

rmSync(outputRoot, { recursive: true, force: true });
mkdirSync(staging, { recursive: true });

function go(args, env = process.env) {
  return execFileSync('go', args, { cwd: engine, env, stdio: 'inherit' });
}

go(['build', '-trimpath', '-o', join(staging, 'main.wasm'), './cmd/wasm/'],
  { ...process.env, GOOS: 'js', GOARCH: 'wasm' });
go(['run', './cmd/precompute-pass-wasm-data/', 'internal/graphdata/edges.json',
  join(staging, 'pass_graph_data.bin')]);
go(['run', './cmd/precompute-ticket-wasm-data/', 'internal/graphdata/edges.json',
  'internal/graphdata/virtual_edges.json', join(staging, 'ticket_graph_data.bin')]);

const goroot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
const runtime = [join(goroot, 'lib/wasm/wasm_exec.js'), join(goroot, 'misc/wasm/wasm_exec.js')]
  .find(existsSync);
if (!runtime) throw new Error('Could not find wasm_exec.js in the Go toolchain.');
copyFileSync(runtime, join(staging, 'wasm_exec.js'));

const hash = createHash('sha256');
for (const name of files) {
  hash.update(name);
  hash.update('\0');
  hash.update(readFileSync(join(staging, name)));
  hash.update('\0');
}
const version = hash.digest('hex');
renameSync(staging, join(outputRoot, version));

const assignment = `NEXT_PUBLIC_WASM_VERSION=${version}\n`;
if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, assignment);
else process.stdout.write(assignment);
console.error(`Built engine assets with content version ${version}`);
