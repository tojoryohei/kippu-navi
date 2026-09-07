import { calcSplit } from '@/app/split/lib/calcSplit';
import type { CacheResult } from '@/app/types';

export async function getOptimalSplitWithCache(
    startStation: string,
    endStation: string
): Promise<CacheResult | null> {

    const startTime = performance.now();

    const result = calcSplit.findOptimalSplitByShortestGiseiKiloPath(startStation, endStation);

    if (!result) {
        return null;
    }

    const endTime = performance.now();
    return { data: result, isCacheHit: false, time: endTime - startTime };
}
