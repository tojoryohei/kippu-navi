import { describe, it, expect } from "vitest";
import { calculateFareFromPath } from "@/app/utils/calcFare";
import { PathStep } from "@/app/types";

describe("第78条 電車特定区間内の大人普通旅客運賃", () => {
    describe("300 キロメートル以下の営業キロ", () => {
        it("須磨海浜公園-手柄山平和公園 50.6キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "須磨海浜公園", lineName: "サンヨ" },
                { stationName: "須磨", lineName: "サンヨ" },
                { stationName: "塩屋", lineName: "サンヨ" },
                { stationName: "垂水", lineName: "サンヨ" },
                { stationName: "舞子", lineName: "サンヨ" },
                { stationName: "朝霧", lineName: "サンヨ" },
                { stationName: "明石", lineName: "サンヨ" },
                { stationName: "西明石", lineName: "サンヨ" },
                { stationName: "（陽）大久保", lineName: "サンヨ" },
                { stationName: "魚住", lineName: "サンヨ" },
                { stationName: "土山", lineName: "サンヨ" },
                { stationName: "東加古川", lineName: "サンヨ" },
                { stationName: "加古川", lineName: "サンヨ" },
                { stationName: "宝殿", lineName: "サンヨ" },
                { stationName: "曽根", lineName: "サンヨ" },
                { stationName: "ひめじ別所", lineName: "サンヨ" },
                { stationName: "御着", lineName: "サンヨ" },
                { stationName: "東姫路", lineName: "サンヨ" },
                { stationName: "姫路", lineName: "サンヨ" },
                { stationName: "手柄山平和公園", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(960);
        });
    });
});
