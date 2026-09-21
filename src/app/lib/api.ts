// 開発時はVite、本番はCloudflare Workerが同一オリジンのAPIを転送する。
export function getApiUrl(path: string): string {
    return path;
}

export const API_REQUEST_TIMEOUT_MS = 15_000;
export const TICKET_SPLIT_API_REQUEST_TIMEOUT_MS = 120_000;

const NETWORK_RETRY_DELAYS_MS = [250];

export interface AbortTimeoutHandle {
    signal: AbortSignal;
    didTimeout(): boolean;
    dispose(): void;
}

export function createAbortTimeout(parentSignal: AbortSignal | undefined, timeoutMs = API_REQUEST_TIMEOUT_MS): AbortTimeoutHandle {
    const controller = new AbortController();
    let timedOut = false;
    let disposed = false;

    const onParentAbort = () => controller.abort(parentSignal?.reason);
    if (parentSignal) {
        if (parentSignal.aborted) {
            controller.abort(parentSignal.reason);
        } else {
            parentSignal.addEventListener("abort", onParentAbort, { once: true });
        }
    }

    const timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
    }, timeoutMs);

    return {
        signal: controller.signal,
        didTimeout: () => timedOut,
        dispose() {
            if (disposed) return;
            disposed = true;
            clearTimeout(timeoutId);
            parentSignal?.removeEventListener("abort", onParentAbort);
        },
    };
}

function abortError(signal: AbortSignal): DOMException {
    return signal.reason instanceof DOMException
        ? signal.reason
        : new DOMException("The operation was aborted.", "AbortError");
}

function waitForRetry(delayMs: number, signal: AbortSignal | undefined): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortError(signal));

    return new Promise((resolve, reject) => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const onAbort = () => {
            clearTimeout(timeoutId);
            signal?.removeEventListener("abort", onAbort);
            reject(abortError(signal!));
        };
        timeoutId = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, delayMs);
        signal?.addEventListener("abort", onAbort, { once: true });
    });
}

export async function fetchWithNetworkRetry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt <= NETWORK_RETRY_DELAYS_MS.length; attempt++) {
        try {
            return await fetch(input, init);
        } catch (error) {
            const aborted = init?.signal?.aborted || (error instanceof DOMException && error.name === "AbortError");
            if (aborted || attempt === NETWORK_RETRY_DELAYS_MS.length) throw error;
            await waitForRetry(NETWORK_RETRY_DELAYS_MS[attempt], init?.signal ?? undefined);
        }
    }

    throw new Error("Network request retry failed.");
}
