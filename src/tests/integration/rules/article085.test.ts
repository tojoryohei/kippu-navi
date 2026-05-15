import { describe, it, expect } from "vitest";
import { calculateFareFromPath } from "@/app/utils/calcFare";

describe("第85条の２ 加算普通旅客運賃の適用区間及び額", () => {
    it("南千歳・新千歳空港間（20円）", () => {
        const path = [
            { stationName: "南千歳", lineName: "チトセ２" },
            { stationName: "新千歳空港", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(230);
    });

    it("日根野・りんくうタウン間（160円）", () => {
        const path = [
            { stationName: "日根野", lineName: "カンク" },
            { stationName: "りんくうタウン", lineName: null }
        ];
        expect(calculateFareFromPath(path)).toBe(340);
    });

    it("日根野・関西空港間（220円）", () => {
        const path = [
            { stationName: "日根野", lineName: "カンク" },
            { stationName: "りんくうタウン", lineName: "カンク" },
            { stationName: "関西空港", lineName: null }
        ];
        expect(calculateFareFromPath(path)).toBe(460);
    });

    it("りんくうタウン・関西空港間（170円）", () => {
        const path = [
            { stationName: "りんくうタウン", lineName: "カンク" },
            { stationName: "関西空港", lineName: null }
        ];
        expect(calculateFareFromPath(path)).toBe(370);
    });

    it("児島・宇多津間", () => {
        const path = [
            { stationName: "児島", lineName: "ヒサセ" },
            { stationName: "宇多津", lineName: null }
        ];
        expect(calculateFareFromPath(path)).toBe(540);
    });

    it("田吉・宮崎空港間", () => {
        const path = [
            { stationName: "田吉", lineName: "ミヤクウ" },
            { stationName: "宮崎空港", lineName: null }
        ];
        expect(calculateFareFromPath(path)).toBe(330);
    });
});
