import type { SplitCacheResult, SplitStationResponse } from '@/app/types';
import { getApiUrl } from '@/app/lib/api';

export async function getOptimalPassWithCache(
    startStation: string,
    endStation: string,
    months: number,
    isIc: boolean,
    noSplitStations: string[] = [],
    maxSplits = isIc ? 1 : 0,
): Promise<SplitCacheResult | null> {
    const startTime = performance.now();

    const params = new URLSearchParams({
        from: startStation,
        to: endStation,
        months: months.toString(),
    });
    if (maxSplits > 0) {
        params.set("maxSplits", maxSplits.toString());
    }
    for (const station of noSplitStations) {
        params.append("noSplitStation", station);
    }

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

    const data: SplitStationResponse = await response.json();

    if (data.error) {
        throw new Error(data.error);
    }

    const endTime = performance.now();
    return {
        data,
        isCacheHit: false,
        time: endTime - startTime,
    };
}
