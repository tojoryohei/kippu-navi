import { createHash } from 'node:crypto';

// 認証情報の送信先を固定し、公開済みdigestから実行対象のmanifestを解決する。
export async function resolvePlatformImage(image, { token, fetcher = fetch }) {
  const match = /^asia-northeast1-docker\.pkg\.dev\/(bubbly-trail-470023-e4\/cloud-run-source-deploy\/calculation-engine(?:-staging)?)@(sha256:[a-f0-9]{64})$/.exec(image ?? '');
  if (!match) throw new Error('公開イメージの参照が許可されていません');
  const response = await fetcher(`https://asia-northeast1-docker.pkg.dev/v2/${match[1]}/manifests/${match[2]}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json' },
    redirect: 'error', signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`公開イメージのmanifest取得に失敗しました: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (`sha256:${createHash('sha256').update(bytes).digest('hex')}` !== match[2]) throw new Error('公開イメージのmanifestのdigestが一致しません');
  const manifest = JSON.parse(bytes.toString('utf8'));
  if (['application/vnd.oci.image.manifest.v1+json', 'application/vnd.docker.distribution.manifest.v2+json'].includes(manifest.mediaType)) return image;
  if (!['application/vnd.oci.image.index.v1+json', 'application/vnd.docker.distribution.manifest.list.v2+json'].includes(manifest.mediaType) || !Array.isArray(manifest.manifests)) throw new Error('公開イメージのmanifest形式が不正です');
  const candidates = manifest.manifests.filter(entry => entry.platform?.os === 'linux' && entry.platform?.architecture === 'amd64');
  if (candidates.length !== 1 || !/^sha256:[a-f0-9]{64}$/.test(candidates[0].digest)) throw new Error('Linux/amd64の実行イメージを一意に特定できません');
  return `${image.slice(0, image.lastIndexOf('@'))}@${candidates[0].digest}`;
}
