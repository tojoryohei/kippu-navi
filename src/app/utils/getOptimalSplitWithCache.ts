import { getDb } from '@/app/utils/firebase';
import { calcSplit } from '@/app/split/lib/calcSplit';
import { SplitApiResponse } from '@/app/types';

const FARE_DATA_VERSION = '2026-03';

interface CachedSplitTicket {
    result: SplitApiResponse;
    version: string;
    createdAt: number;
}

export async function getOptimalSplitWithCache(
    startStation: string,
    endStation: string
): Promise<SplitApiResponse | null> {
    const cacheKey = `${startStation}_${endStation}`;

    // 1. キャッシュからの読み込みを試行
    try {
        // 実行時に初めてFirestoreインスタンスを取得（ビルド時のクラッシュを防止）
        const db = getDb();
        const docRef = db.collection('split_ticket_caches').doc(cacheKey);
        const docSnap = await docRef.get();

        if (docSnap.exists) {
            const data = docSnap.data() as CachedSplitTicket;

            if (data.version === FARE_DATA_VERSION) {
                return data.result;
            }
        }
    } catch (error) {
        // 環境変数不足やDB接続エラー時はログを出力し、安全に新規計算へフォールバックする
        console.error(`[Firestore Read Error] Failed to read cache for ${cacheKey}:`, error);
    }

    // 2. キャッシュがない、またはエラーが発生した場合は新規計算
    const result = calcSplit.findOptimalSplitByShortestGiseiKiloPath(startStation, endStation);

    if (!result) {
        return null;
    }

    // 3. 計算結果のキャッシュ保存を試行
    try {
        const db = getDb();
        const docRef = db.collection('split_ticket_caches').doc(cacheKey);

        const cacheData: CachedSplitTicket = {
            result,
            version: FARE_DATA_VERSION,
            createdAt: Date.now(),
        };

        // set()は非同期で実行し、完了を待たずにレスポンスを返す（APIの応答速度優先）
        docRef.set(cacheData).catch(err => {
            console.error(`[Firestore Write Error] Failed to save cache for ${cacheKey}:`, err);
        });
    } catch (error) {
        console.error(`[Firestore Setup Error] Failed to prepare cache write for ${cacheKey}:`, error);
    }

    return result;
}