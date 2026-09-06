import { PassCacheResult, SplitPassResult } from '@/app/types';
import { getApiUrl } from '@/app/lib/api';

export async function getOptimalPassWithCache(
    startStation: string,
    endStation: string,
    months: number,
    isIc: boolean
): Promise<PassCacheResult | null> {
    const startTime = performance.now();

    const params = new URLSearchParams({
        from: startStation,
        to: endStation,
        months: months.toString(),
    });

    const endpoint = isIc
        ? "/api/split-icpass"
        : "/api/split-pass";

    const response = await fetch(`${getApiUrl(endpoint)}?${params.toString()}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
        cache: "no-store"
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "サーバー内部でエラーが発生しました。");
    }

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    const result: SplitPassResult = {
        passStations: {
            normal: data.normal || [],
            splitPatterns: data.splitPatterns || data.results || []
        }
    };

    const endTime = performance.now();
    return {
        data: result,
        isCacheHit: false,
        time: endTime - startTime,
    };
}
