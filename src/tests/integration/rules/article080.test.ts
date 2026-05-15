import { describe, it, expect } from "vitest";
import { calculateFareFromPath } from "@/app/utils/calcFare";
import { PathStep } from "@/app/types";

describe("第80条 新幹線の並行区間等における大人普通旅客運賃の特定", () => {
    describe("（1）京都・新大阪間", () => {
        it("京都-新大阪 39.0キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "京都", lineName: "シンカ" },
                { stationName: "新大阪", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(580);
        });
    });

    describe("鉄道駅バリアフリー料金を収受する区間内の駅相互間の普通旅客運賃", () => {
        it("新神戸-西明石 22.8キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "新神戸", lineName: "シンカ" },
                { stationName: "西明石", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(410);
        });
    });
});
