import { describe, it, expect } from 'vitest';
import { calculateFareFromPath } from '@/app/utils/calcFare';

describe('運賃計算テスト', () => {


    it('東京→品川（新幹線経由）', () => {
        const mockPath = [{ stationName: "東京", lineName: "シンカ" }, { stationName: "品川", lineName: null }];
        const fare = calculateFareFromPath(mockPath);
        expect(fare).toBe(180);
    });

    it('東京→品川（在来線経由）', () => {
        const mockPath = [{ stationName: "東京", lineName: "トウカ" }, { stationName: "有楽町", lineName: "トウカ" }, { stationName: "新橋", lineName: "トウカ" }, { stationName: "浜松町", lineName: "トウカ" }, { stationName: "田町", lineName: "トウカ" }, { stationName: "高輪ゲートウェイ", lineName: "トウカ" }, { stationName: "品川", lineName: null }];
        const fare = calculateFareFromPath(mockPath);
        expect(fare).toBe(210);
    });
});