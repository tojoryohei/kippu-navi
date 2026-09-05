import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const version = process.env.NEXT_PUBLIC_WASM_VERSION;
const environment = process.env.DEPLOY_ENVIRONMENT;
if (!version || !/^[a-f0-9]{40}$/.test(version)) {
  throw new Error('NEXT_PUBLIC_WASM_VERSION must be the full Git commit SHA used for the Next.js build.');
}
if (!['staging', 'production'].includes(environment)) {
  throw new Error('DEPLOY_ENVIRONMENT must be staging or production.');
}
const out = join(root, 'out');
if (!existsSync(join(out, 'index.html'))) {
  throw new Error('Run npm run build before packaging Cloudflare assets.');
}
const engine = join(root, 'calculation-engine');
const engineRoot = join(out, 'engine');
// Only the four freshly built client files belong in the deployment.
// In particular, do not ship local server fare caches or stale Go runtimes.
rmSync(engineRoot, { recursive: true, force: true });
const destination = join(engineRoot, version);
mkdirSync(destination, { recursive: true });
function go(args, env = process.env) {
  return execFileSync('go', args, { cwd: engine, env, stdio: 'inherit' });
}
go(['build', '-trimpath', '-o', join(destination, 'main.wasm'), './cmd/wasm/'],
  { ...process.env, GOOS: 'js', GOARCH: 'wasm' });
go(['run', './cmd/precompute-pass-wasm-data/', 'internal/graphdata/edges.json',
  join(destination, 'pass_graph_data.bin')]);
go(['run', './cmd/precompute-ticket-wasm-data/', 'internal/graphdata/edges.json',
  'internal/graphdata/virtual_edges.json', join(destination, 'ticket_graph_data.bin')]);
const goroot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
const runtime = [join(goroot, 'lib/wasm/wasm_exec.js'), join(goroot, 'misc/wasm/wasm_exec.js')]
  .find(existsSync);
if (!runtime) throw new Error('Could not find wasm_exec.js in the Go toolchain.');
copyFileSync(runtime, join(destination, 'wasm_exec.js'));

// Cloudflare Workers does not execute the Pages Functions directory or _routes.json.
rmSync(join(out, '_routes.json'), { force: true });
const sourceHeaders = join(root, 'public', '_headers');
let headers = existsSync(sourceHeaders) ? readFileSync(sourceHeaders, 'utf8') : '';
if (environment === 'staging') {
  const globalRule = /^\/\*\r?$/m;
  const noindex = '/*\n  X-Robots-Tag: noindex, nofollow';
  headers = globalRule.test(headers)
    ? headers.replace(globalRule, noindex)
    : `${noindex}\n\n${headers}`;
}
headers += '\n/engine/*\n  Cache-Control: public, max-age=31536000, immutable\n\n/deployment.json\n  Cache-Control: no-store\n';
writeFileSync(join(out, '_headers'), headers);
writeFileSync(join(out, 'deployment.json'), JSON.stringify({
  environment,
  branch: process.env.GITHUB_REF_NAME || 'local',
  commit: version,
  enginePath: `/engine/${version}`,
}, null, 2) + '\n');

// Reject oversized files before a deploy can publish an incomplete engine.
function verifyFiles(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) verifyFiles(path);
    else if (statSync(path).size > 25 * 1024 * 1024) {
      throw new Error(`Static asset exceeds Cloudflare's 25 MiB limit: ${path}`);
    }
  }
}
verifyFiles(out);
const magic = readFileSync(join(destination, 'main.wasm')).subarray(0, 4);
if (!magic.equals(Buffer.from([0, 97, 115, 109]))) throw new Error('Invalid WASM binary.');
console.log(`Packaged ${environment} engine at /engine/${version}/`);
