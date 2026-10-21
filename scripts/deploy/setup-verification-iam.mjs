// 管理者の既存gcloudログインで環境ごとに初期設定する。
// サービスアカウントキーやプロジェクト単位のロールは作成しない。
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { config } from '../verification/config.mjs';
const { values } = parseArgs({ options: { environment: { type: 'string' }, provider: { type: 'string' }, apply: { type: 'boolean', default: false } } });
const c = config(values.environment);
if (!/^projects\/198310540092\/locations\/global\/workloadIdentityPools\/[a-z0-9-]+\/providers\/[a-z0-9-]+$/.test(values.provider ?? '')) throw new Error('対象プロジェクトの既存WIF provider完全名が必要です');
const provider = JSON.parse(execFileSync('gcloud', ['iam', 'workload-identity-pools', 'providers', 'describe', values.provider, '--format=json'], { encoding: 'utf8' }));
if (provider.attributeMapping?.['google.subject'] !== 'assertion.sub' || provider.oidc?.issuerUri !== 'https://token.actions.githubusercontent.com') throw new Error('既存WIFのissuer/subject mappingが想定と異なります');
const accountId = `github-smoke-${c.environment}`;
const account = `${accountId}@${c.project}.iam.gserviceaccount.com`;
const pool = values.provider.split('/providers/')[0];
const principal = `principal://iam.googleapis.com/${pool}/subject/repo:tojoryohei/kippu-navi:environment:${c.environment}`;
const commands = [
  ['iam', 'service-accounts', 'create', accountId, '--project', c.project, '--display-name', `GitHubデプロイ検証 (${c.environment})`],
  ['iam', 'service-accounts', 'add-iam-policy-binding', account, '--project', c.project, '--role', 'roles/iam.workloadIdentityUser', '--member', principal],
  ['run', 'services', 'add-iam-policy-binding', c.service, '--project', c.project, '--region', c.region, '--role', 'roles/run.invoker', '--member', `serviceAccount:${account}`],
];
if (values.apply) {
  const accounts = JSON.parse(execFileSync('gcloud', ['iam', 'service-accounts', 'list', '--project', c.project, '--format=json'], { encoding: 'utf8' }));
  if (!accounts.some(a => a.email === account)) execFileSync('gcloud', commands[0], { stdio: 'inherit' });
  const policy = JSON.parse(execFileSync('gcloud', ['iam', 'service-accounts', 'get-iam-policy', account, '--project', c.project, '--format=json'], { encoding: 'utf8' }));
  if ((policy.bindings ?? []).some(b => b.members.some(m => m !== principal))) throw new Error('検証SAに想定外の権限委譲があります。自動削除せず確認してください');
  for (const args of commands.slice(1)) execFileSync('gcloud', [...args, '--quiet'], { stdio: 'inherit' });
}
process.stdout.write(`${JSON.stringify({ environment: c.environment, provider: values.provider, service: c.service, account, principal, applied: values.apply, commands }, null, 2)}\n`);
