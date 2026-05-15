import { describe, it, expect } from "vitest";
import { calculateFareFromPath } from "@/app/utils/calcFare";
import { PathStep } from "@/app/types";

describe("第79条 東京附近等の特定区間等における大人普通旅客運賃の特定", () => {
    describe("東京附近、名古屋附近及び大阪附近における駅相互間の大人普通旅客運賃", () => {
        it("京都-大阪 42.8キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "京都", lineName: "トウカ" },
                { stationName: "西大路", lineName: "トウカ" },
                { stationName: "（東）桂川", lineName: "トウカ" },
                { stationName: "向日町", lineName: "トウカ" },
                { stationName: "長岡京", lineName: "トウカ" },
                { stationName: "（東）山崎", lineName: "トウカ" },
                { stationName: "島本", lineName: "トウカ" },
                { stationName: "高槻", lineName: "トウカ" },
                { stationName: "摂津富田", lineName: "トウカ" },
                { stationName: "ＪＲ総持寺", lineName: "トウカ" },
                { stationName: "茨木", lineName: "トウカ" },
                { stationName: "千里丘", lineName: "トウカ" },
                { stationName: "岸辺", lineName: "トウカ" },
                { stationName: "吹田", lineName: "トウカ" },
                { stationName: "東淀川", lineName: "トウカ" },
                { stationName: "新大阪", lineName: "トウカ" },
                { stationName: "大阪", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(580);
        });
    });

    describe("鉄道駅バリアフリー料金を収受する区間内の駅相互間の普通旅客運賃", () => {
        it("京都-大阪 42.8キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "岡崎", lineName: "トウカ" },
                { stationName: "相見", lineName: "トウカ" },
                { stationName: "幸田", lineName: "トウカ" },
                { stationName: "三ケ根", lineName: "トウカ" },
                { stationName: "三河塩津", lineName: "トウカ" },
                { stationName: "蒲郡", lineName: "トウカ" },
                { stationName: "三河三谷", lineName: "トウカ" },
                { stationName: "三河大塚", lineName: "トウカ" },
                { stationName: "愛知御津", lineName: "トウカ" },
                { stationName: "西小坂井", lineName: "トウカ" },
                { stationName: "豊橋", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(590);
        });
    });
});

describe("第79条の２ 東海道本線（新幹線）東京・品川間の大人普通旅客運賃", () => {
    it("東京-品川 6.8キロメートル", () => {
        const path: PathStep[] = [
            { stationName: "東京", lineName: "シンカ" },
            { stationName: "品川", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(180);
    });
});
