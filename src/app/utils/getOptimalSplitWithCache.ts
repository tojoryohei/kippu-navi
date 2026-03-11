import { db } from '@/app/utils/firebase';
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
    const docRef = db.collection('split_ticket_caches').doc(cacheKey);

    try {
        const docSnap = await docRef.get();
        if (docSnap.exists) {
            const data = docSnap.data() as CachedSplitTicket;

            if (data.version === FARE_DATA_VERSION) {
                return data.result;
            }
        }
    } catch (error) {
        console.error(`[Firestore Read Error] Failed to read cache for ${cacheKey}:`, error);
    }

    const result = calcSplit.findOptimalSplitByShortestGiseiKiloPath(startStation, endStation);

    if (!result) {
        return null;
    }

    try {
        const cacheData: CachedSplitTicket = {
            result,
            version: FARE_DATA_VERSION,
            createdAt: Date.now(),
        };

        docRef.set(cacheData).catch(err => {
            console.error(`[Firestore Write Error] Failed to save cache for ${cacheKey}:`, err);
        });
    } catch (error) {
        console.error(`[Firestore Setup Error] Failed to prepare cache write for ${cacheKey}:`, error);
    }

    return result;
}