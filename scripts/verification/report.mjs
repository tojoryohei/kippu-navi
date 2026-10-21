// artifactにはGitHubのログマスクが適用されない。
// 想定外のAPI応答がAuthorizationをechoした場合もトークンを伏せる。
export function serializeReport(report, secrets = []) {
  const tokens = secrets.filter(value => typeof value === 'string' && value.length > 0);
  return tokens.reduce((text, token) => text.replaceAll(token, '[REDACTED]'), JSON.stringify(report, null, 2));
}
