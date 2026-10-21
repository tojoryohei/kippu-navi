import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const environment = process.env.DEPLOY_ENVIRONMENT;
if (!['staging', 'production'].includes(environment)) throw new Error('公開環境が不正です');
// control_shaの設定から値を明示的に選び、buildや自動探索設定を継承しない。
const source = JSON.parse(readFileSync(new URL('./wrangler-settings.json', import.meta.url), 'utf8'));
const selected = source.environments[environment];
const artifact = resolve(process.env.RUNNER_TEMP, 'verified-frontend');
const config = {
  name: selected.name,
  main: resolve(artifact, 'worker/main.mjs'),
  compatibility_date: source.compatibility_date,
  workers_dev: false,
  preview_urls: false,
  no_bundle: true,
  assets: { ...source.assets, directory: resolve(artifact, 'static') },
  vars: selected.vars,
  secrets: source.secrets,
  observability: source.observability,
  ...(selected.routes ? { routes: selected.routes } : {}),
};
writeFileSync(resolve(process.env.RUNNER_TEMP, 'publish-wrangler.json'), JSON.stringify(config, null, 2));
