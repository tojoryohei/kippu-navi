import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function checkRuntimeVersions(root = new URL('../', import.meta.url)) {
  const read = path => readFileSync(new URL(path, root), 'utf8');
  const node = read('.node-version').trim();
  assert.match(node, /^\d+(?:\.\d+){0,2}$/);
  const major = value => Number(value.match(/\d+/)?.[0]);
  const pkg = JSON.parse(read('package.json'));
  const lock = JSON.parse(read('package-lock.json'));
  assert.equal(major(pkg.engines.node), major(node), 'Node engine and CI must use the same major.');
  assert.equal(major(pkg.devDependencies['@types/node']), major(node), '@types/node must match runtime.');
  assert.equal(major(lock.packages['node_modules/@types/node'].version), major(node), 'Locked @types/node must match runtime.');
  const go = read('calculation-engine/go.mod').match(/^go (\d+\.\d+)/m)?.[1];
  assert.ok(go, 'Missing Go directive.');
  assert.equal(read('calculation-engine/Dockerfile').match(/^FROM golang:(\d+\.\d+)/m)?.[1], go, 'Go Docker image and module must use the same release line.');
  for (const name of readdirSync(new URL('.github/workflows/', root))) {
    if (!/\.ya?ml$/.test(name)) continue;
    const workflow = read(`.github/workflows/${name}`);
    assert.doesNotMatch(workflow, /^\s+(?:node-version|go-version):/m, `${name}: use version files instead of duplicate runtime literals.`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  checkRuntimeVersions();
  console.log('Node/Go runtime versions are consistent.');
}
