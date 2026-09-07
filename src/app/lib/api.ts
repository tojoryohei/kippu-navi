// 開発時はVite、本番はCloudflare Workerが同一オリジンのAPIを転送する。
export function getApiUrl(path: string): string {
    return path;
}
