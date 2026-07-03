import { getDb } from '@/app/utils/firebase';
import { PassCacheResult, SplitPassResult } from '@/app/types';

const FARE_DATA_VERSION = '2026-03';

interface FirestoreCachedSplitPass {
    result: {
        passStations: {
            normal: string[];
            splitPatterns: { stations: string[] }[];
        };
    };
    version: string;
    createdAt: number;
}

export async function getOptimalPassWithCache(
    startStation: string,
    endStation: string,
    months: number,
    isIc: boolean
): Promise<PassCacheResult | null> {
    const cacheKey = `${startStation}_${endStation}_${months}箇月${isIc ? 'IC' : ''}定期`;
    const startTime = performance.now();

    // 1. キャッシュからの読み込みを試行
    try {
        const db = getDb();
        const docRef = db.collection('split_passes').doc(cacheKey);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const data = docSnap.data() as FirestoreCachedSplitPass;
            if (data.version === FARE_DATA_VERSION) {
                const endTime = performance.now();
                const result: SplitPassResult = {
                    passStations: {
                        normal: data.result?.passStations?.normal || [],
                        splitPatterns: (data.result?.passStations?.splitPatterns || []).map(item => item.stations)
                    }
                };
                return {
                    data: result,
                    isCacheHit: true,
                    time: endTime - startTime,
                };
            }
        }
    } catch (error) {
        console.error(`[Firestore Read Error] Failed to read cache for ${cacheKey}:`, error);
    }

    // 2. キャッシュがない、またはエラーが発生した場合は新規にAPIを呼び出す
    const params = new URLSearchParams({
        from: startStation,
        to: endStation,
        months: months.toString(),
    });

    const endpoint = isIc
        ? "https://kippu-navi.com/api/split-icpass"
        : "https://kippu-navi.com/api/split-pass";

    const response = await fetch(`${endpoint}?${params.toString()}`, {
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

    // 3. 計算結果のキャッシュ保存を試行
    try {
        const db = getDb();
        const docRef = db.collection('split_passes').doc(cacheKey);

        const cacheData: FirestoreCachedSplitPass = {
            result: {
                passStations: {
                    normal: result.passStations.normal,
                    splitPatterns: result.passStations.splitPatterns.map(stations => ({ stations })),
                }
            },
            version: FARE_DATA_VERSION,
            createdAt: Date.now(),
        };

        // set()は非同期で実行し、完了を待たずにレスポンスを返す（APIの応答速度優先）
        docRef.set(cacheData).catch((err: unknown) => {
            console.error(`[Firestore Write Error] Failed to save cache for ${cacheKey}:`, err);
        });
    } catch (error) {
        console.error(`[Firestore Setup Error] Failed to prepare cache write for ${cacheKey}:`, error);
    }

    const endTime = performance.now();
    return {
        data: result,
        isCacheHit: false,
        time: endTime - startTime,
    };
}

