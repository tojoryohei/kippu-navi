import { describe, it, expect } from 'vitest';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { PathStep } from '@/app/types';

describe('特殊運賃ルール', () => {
    it('異常系: 駅が1つだけの場合はエラー', () => {
        const path: PathStep[] = [{ stationName: "東京", lineName: null }];
        expect(() => calculateFareFromPath(path)).toThrow(`calculateFareFromPath: 経路が不正です。運賃計算には2駅以上の経路が必要です。`);
    });

    it('異常系: 2駅以上でlineNameがnullの場合はエラー', () => {
        const path: PathStep[] = [
            { stationName: "東京", lineName: null },
            { stationName: "品川", lineName: null }
        ];
        expect(() => calculateFareFromPath(path)).toThrow(`calculateFareFromPath: 経路が不正です。経路の途中でlineNameにnullは使えません。`);
    });
});
