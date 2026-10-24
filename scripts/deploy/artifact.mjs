// 公開ジョブではcontrol_shaのこのコードだけで成果物を検証する。
import { createHash } from 'node:crypto';
import { createReadStream, constants } from 'node:fs';
import { appendFile, chmod, copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_FILES = 30000;
const MAX_BYTES = 8 * 1024 ** 3;
const MAX_MANIFEST_BYTES = 8 * 1024 ** 2;
const PUBLIC_EXTENSIONS = new Set([
  '.html', '.js', '.mjs', '.css', '.json', '.webmanifest', '.txt', '.xml',
  '.wasm', '.bin', '.woff', '.woff2', '.ttf', '.png', '.ico', '.svg', '.webp',
  '.jpg', '.jpeg', '.avif', '.gif', '.md',
]);

export async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function identity(kind, env, attempt) {
  if (!['frontend', 'sentry', 'api'].includes(kind)) throw new Error('成果物種別が不正です');
  if (![env.TARGET_SHA, env.CONTROL_SHA].every(sha => typeof sha === 'string' && /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error('完全SHAが必要です');
  }
  if (!['staging', 'production'].includes(env.DEPLOY_ENVIRONMENT)) throw new Error('公開環境が不正です');
  if (![env.GITHUB_RUN_ID, attempt].every(value => typeof value === 'string' && /^[1-9][0-9]*$/.test(value))) {
    throw new Error('生成run・attemptが不正です');
  }
  return {
    TARGET_SHA: env.TARGET_SHA, CONTROL_SHA: env.CONTROL_SHA, DEPLOY_ENVIRONMENT: env.DEPLOY_ENVIRONMENT,
    kind, run_id: env.GITHUB_RUN_ID, run_attempt: attempt, release: env.RELEASE ?? '',
  };
}

function safeName(name) {
  if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0')) return false;
  return name.split('/').every((part, index, parts) => (part && !part.startsWith('.')) ||
    (part === '.well-known' && index === 1 && parts[0] === 'static'));
}

function allowed(name, kind) {
  if (name === 'manifest.json') return true;
  if (kind === 'api') return name === 'image.tar';
  if (kind === 'sentry') return name.startsWith('sourcemaps/') && ['.js', '.mjs', '.map'].includes(extname(name));
  if (['worker/main.mjs', 'static/.well-known/api-catalog', 'static/.well-known/apple-app-site-association', 'static/.well-known/traffic-advice'].includes(name)) return true;
  if (!name.startsWith('static/') || name.endsWith('.map') || ['package.json', 'package-lock.json', 'wrangler.json', 'wrangler.jsonc'].includes(basename(name))) return false;
  return ['_headers', 'robots.txt', 'llms.txt', 'ads.txt'].includes(basename(name)) || PUBLIC_EXTENSIONS.has(extname(name));
}

async function inventory(root, kind, verifying) {
  const rootInfo = await lstat(root);
  if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink()) throw new Error('成果物は通常のディレクトリである必要があります');
  const files = new Map();
  let total = 0;
  let entries = 0;
  async function walk(directory, prefix = '') {
    for (const entry of (await readdir(directory)).sort()) {
      const name = prefix ? `${prefix}/${entry}` : entry;
      if (++entries > MAX_FILES * 2 || !safeName(name)) throw new Error(`不正なパスまたは成果物の上限超過です: ${name}`);
      const path = join(root, name);
      const info = await lstat(path);
      if (info.isSymbolicLink() || !(info.isDirectory() || info.isFile()) || (info.isFile() && info.nlink !== 1)) {
        throw new Error(`リンク・特殊ファイルは許可しません: ${name}`);
      }
      if (info.isDirectory()) {
        await walk(path, name);
        continue;
      }
      if (!allowed(name, kind)) throw new Error(`許可しない成果物パスです: ${name}`);
      if (verifying && info.mode & 0o7111) throw new Error(`通常の非実行ファイルだけを許可します: ${name}`);
      total += info.size;
      if (total > MAX_BYTES || files.size >= MAX_FILES) throw new Error('成果物が上限を超えています');
      if (name === 'manifest.json' && info.size > MAX_MANIFEST_BYTES) throw new Error('manifestが上限を超えています');
      files.set(name, path);
    }
  }
  await walk(root);
  return { paths: files, total };
}

function requiredFiles(kind, names) {
  const required = kind === 'frontend'
    ? ['static/index.html', 'static/deployment.json', 'static/pwa-assets.json', 'static/sw.js', 'worker/main.mjs']
    : kind === 'api' ? ['image.tar'] : [];
  if (!required.every(name => names.has(name)) || kind === 'sentry' && ![...names.keys()].some(name => name.endsWith('.map'))) {
    throw new Error('必須成果物がありません');
  }
}

async function checkDeployment(kind, source, env) {
  if (kind !== 'frontend') return;
  const deployment = JSON.parse(await readFile(join(source, 'static/deployment.json'), 'utf8'));
  if (deployment?.commit !== env.TARGET_SHA || deployment?.environment !== env.DEPLOY_ENVIRONMENT) {
    throw new Error('deployment.jsonが公開対象と一致しません');
  }
}

// 圧縮・展開はGitHub Actionsに任せ、ここではmanifestを作成する。
export async function prepare(kind, source, env = process.env) {
  const metadata = identity(kind, env, env.GITHUB_RUN_ATTEMPT);
  const { paths, total } = await inventory(source, kind, false);
  if (paths.has('manifest.json')) throw new Error('manifestは新規作成する必要があります');
  if (!paths.size) throw new Error('成果物が空です');
  requiredFiles(kind, paths);
  await checkDeployment(kind, source, env);
  const files = Object.create(null);
  for (const [name, path] of paths) {
    // eslint-disable-next-line security/detect-object-injection -- 検証済みの相対パスをプロトタイプのない辞書へ保存する。
    files[name] = await digest(path);
    // upload/download-artifactも通常ファイルを0644として扱う。
    await chmod(path, 0o644);
  }
  const manifest = Buffer.from(`${JSON.stringify({ ...metadata, files })}\n`);
  if (manifest.length > MAX_MANIFEST_BYTES || paths.size >= MAX_FILES || total + manifest.length > MAX_BYTES) throw new Error('成果物が上限を超えています');
  const manifestPath = join(source, 'manifest.json');
  await writeFile(manifestPath, manifest, { flag: 'wx', mode: 0o644 });
  await appendFile(env.GITHUB_OUTPUT, `${kind}_manifest_sha256=${await digest(manifestPath)}\n`);
}

export async function verify(kind, source, destination, env = process.env) {
  const expectedIdentity = identity(kind, env, env.EXPECTED_ATTEMPT);
  const existing = await lstat(destination).catch(error => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (existing) throw new Error('公開用の出力先は新規ディレクトリである必要があります');
  const { paths } = await inventory(source, kind, true);
  if (!paths.has('manifest.json')) throw new Error('manifestがありません');
  const manifestPath = paths.get('manifest.json');
  if (!/^[a-f0-9]{64}$/.test(env.EXPECTED_MANIFEST_SHA256 ?? '') || await digest(manifestPath) !== env.EXPECTED_MANIFEST_SHA256) {
    throw new Error('manifestのSHA-256が一致しません');
  }
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  // eslint-disable-next-line security/detect-object-injection -- identityが生成した固定キーだけを参照する。
  if (!manifest || Object.entries(expectedIdentity).some(([key, value]) => manifest[key] !== value)) {
    throw new Error('成果物のSHA・環境・生成run・releaseが一致しません');
  }
  const files = manifest.files;
  if (!files || typeof files !== 'object' || Array.isArray(files) ||
      Object.keys(files).length !== paths.size - 1 || Object.keys(files).some(name => name === 'manifest.json' || !safeName(name) || !allowed(name, kind) || !paths.has(name))) {
    throw new Error('manifestのファイル一覧が一致しません');
  }
  for (const [name, path] of paths) {
    // eslint-disable-next-line security/detect-object-injection -- 検証済みの相対パスでown propertyだけを参照する。
    if (name !== 'manifest.json' && (!Object.hasOwn(files, name) || await digest(path) !== files[name])) {
      throw new Error(`ファイルのSHA-256が一致しません: ${name}`);
    }
  }
  requiredFiles(kind, paths);
  await checkDeployment(kind, source, env);
  // 全検証後に、新規の公開用ディレクトリへ通常ファイルだけをコピーする。
  await mkdir(destination);
  for (const [name, path] of paths) {
    const output = join(destination, name);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(path, output, constants.COPYFILE_EXCL);
    await chmod(output, 0o644);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [command, kind, source, destination, ...extra] = process.argv.slice(2);
  if (extra.length || !source || command === 'prepare' && destination || command === 'verify' && !destination || !['prepare', 'verify'].includes(command)) {
    throw new Error('使用方法: artifact.mjs prepare <kind> <source> | verify <kind> <source> <destination>');
  }
  if (command === 'prepare') await prepare(kind, source);
  else await verify(kind, source, destination);
}
