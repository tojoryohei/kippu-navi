import { describe, it, expect } from "vitest";
import { generateKippu } from "@/app/mr/lib/generateKippu";
import { RouteRequest } from "@/app/types";

describe("generateKippu 運賃計算プログラム - 重複駅チェック", () => {
    it("最後尾以外で同じ駅が2度出現した場合はエラーをスローする (通常モード)", () => {
        const request: RouteRequest = {
            path: [
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "浜野", lineName: "内房" },
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "八幡宿", lineName: null }
            ],
            calculationMode: "normal"
        };
        expect(() => generateKippu(request)).toThrow("経路が重複しています。");
    });

    it("最後尾以外で同じ駅が2度出現した場合はエラーをスローする (最安モード)", () => {
        const request: RouteRequest = {
            path: [
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "浜野", lineName: "内房" },
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "八幡宿", lineName: null }
            ],
            calculationMode: "cheapest"
        };
        expect(() => generateKippu(request)).toThrow("経路が重複しています。");
    });

    it("最後尾以外で同じ駅が2度出現した場合はエラーをスローする (補正禁止モード)", () => {
        const request: RouteRequest = {
            path: [
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "浜野", lineName: "内房" },
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "八幡宿", lineName: null }
            ],
            calculationMode: "uncorrect"
        };
        expect(() => generateKippu(request)).toThrow("経路が重複しています。");
    });

    it("最後の一駅のみの重複 (環状/6の字) の場合はエラーをスローしない", () => {
        const request: RouteRequest = {
            path: [
                { stationName: "蘇我", lineName: "内房" },
                { stationName: "五井", lineName: "内房" },
                { stationName: "八幡宿", lineName: null }
            ],
            calculationMode: "normal"
        };
        expect(() => generateKippu(request)).not.toThrow();
        const res = generateKippu(request);
        expect(res.totalEigyoKilo).toBeGreaterThan(0);
    });
});
