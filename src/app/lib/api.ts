// 開発時はVite、本番はCloudflare Workerが同一オリジンのAPIを転送する。
export function getApiUrl(path: string): string {
    return path;
}

const NETWORK_RETRY_DELAYS_MS = [250];

export async function fetchWithNetworkRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt++) {
        try {
            return await fetch(input, init);
        } catch (error) {
            const aborted = init?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
            if (aborted || attempt === NETWORK_RETRY_DELAYS_MS.length) throw error;
            await new Promise(resolve => setTimeout(resolve, NETWORK_RETRY_DELAYS_MS[attempt]));
        }
    }

    throw new Error("Network request retry failed.");
}
