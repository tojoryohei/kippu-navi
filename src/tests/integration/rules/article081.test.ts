import { describe, it, expect } from "vitest";
import { calculateFareFromPath } from "@/app/utils/calcFare";
import { PathStep } from "@/app/types";

describe("第81条 幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃", () => {
    it("広島-あき亀山 18.6キロメートル", () => {
        const path: PathStep[] = [
            { stationName: "広島", lineName: "サンヨ" },
            { stationName: "新白島", lineName: "サンヨ" },
            { stationName: "（陽）横川", lineName: "カヘ" },
            { stationName: "三滝", lineName: "カヘ" },
            { stationName: "安芸長束", lineName: "カヘ" },
            { stationName: "下祇園", lineName: "カヘ" },
            { stationName: "古市橋", lineName: "カヘ" },
            { stationName: "（可）大町", lineName: "カヘ" },
            { stationName: "緑井", lineName: "カヘ" },
            { stationName: "七軒茶屋", lineName: "カヘ" },
            { stationName: "梅林", lineName: "カヘ" },
            { stationName: "上八木", lineName: "カヘ" },
            { stationName: "中島", lineName: "カヘ" },
            { stationName: "可部", lineName: "カヘ" },
            { stationName: "河戸帆待川", lineName: "カヘ" },
            { stationName: "あき亀山", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(420);
    });
});

describe("第81条の２ 北海道旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃", () => {
    it("札幌-北海道医療大学 30.5キロメートル", () => {
        const path: PathStep[] = [
            { stationName: "札幌", lineName: "ハコタ" },
            { stationName: "桑園", lineName: "サツシ" },
            { stationName: "八軒", lineName: "サツシ" },
            { stationName: "新川", lineName: "サツシ" },
            { stationName: "新琴似", lineName: "サツシ" },
            { stationName: "太平", lineName: "サツシ" },
            { stationName: "百合が原", lineName: "サツシ" },
            { stationName: "篠路", lineName: "サツシ" },
            { stationName: "拓北", lineName: "サツシ" },
            { stationName: "あいの里教育大", lineName: "サツシ" },
            { stationName: "あいの里公園", lineName: "サツシ" },
            { stationName: "ロイズタウン", lineName: "サツシ" },
            { stationName: "太美", lineName: "サツシ" },
            { stationName: "当別", lineName: "サツシ" },
            { stationName: "北海道医療大学", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(800);
    });
});

describe("第81条の３ 東日本旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃", () => {
    it("山形-左沢 26.2キロメートル", () => {
        const path: PathStep[] = [
            { stationName: "山形", lineName: "オウウ" },
            { stationName: "北山形", lineName: "アテラ" },
            { stationName: "東金井", lineName: "アテラ" },
            { stationName: "羽前山辺", lineName: "アテラ" },
            { stationName: "羽前金沢", lineName: "アテラ" },
            { stationName: "羽前長崎", lineName: "アテラ" },
            { stationName: "南寒河江", lineName: "アテラ" },
            { stationName: "寒河江", lineName: "アテラ" },
            { stationName: "西寒河江", lineName: "アテラ" },
            { stationName: "羽前高松", lineName: "アテラ" },
            { stationName: "柴橋", lineName: "アテラ" },
            { stationName: "左沢", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(530);
    });
});

describe("第81条の４ 四国旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃", () => {
    it("徳島-鳴門 18.8キロメートル", () => {
        const path: PathStep[] = [
            { stationName: "徳島", lineName: "コウト" },
            { stationName: "佐古", lineName: "コウト" },
            { stationName: "吉成", lineName: "コウト" },
            { stationName: "勝瑞", lineName: "コウト" },
            { stationName: "池谷", lineName: "ナルト" },
            { stationName: "阿波大谷", lineName: "ナルト" },
            { stationName: "立道", lineName: "ナルト" },
            { stationName: "教会前", lineName: "ナルト" },
            { stationName: "金比羅前", lineName: "ナルト" },
            { stationName: "撫養", lineName: "ナルト" },
            { stationName: "鳴門", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(430);
    });
});

describe("第81条の５ 九州旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃", () => {
    it("長崎-佐世保 81.4キロメートル", () => {
        const path: PathStep[] = [
            { stationName: "長崎", lineName: "ナカサ" },
            { stationName: "浦上", lineName: "ナカサ" },
            { stationName: "現川", lineName: "ナカサ" },
            { stationName: "肥前古賀", lineName: "ナカサ" },
            { stationName: "市布", lineName: "ナカサ" },
            { stationName: "喜々津", lineName: "ナカサ" },
            { stationName: "西諫早", lineName: "ナカサ" },
            { stationName: "諫早", lineName: "オオム" },
            { stationName: "岩松", lineName: "オオム" },
            { stationName: "大村", lineName: "オオム" },
            { stationName: "諏訪", lineName: "オオム" },
            { stationName: "新大村", lineName: "オオム" },
            { stationName: "竹松", lineName: "オオム" },
            { stationName: "大村車両基地", lineName: "オオム" },
            { stationName: "松原", lineName: "オオム" },
            { stationName: "千綿", lineName: "オオム" },
            { stationName: "彼杵", lineName: "オオム" },
            { stationName: "川棚", lineName: "オオム" },
            { stationName: "小串郷", lineName: "オオム" },
            { stationName: "南風崎", lineName: "オオム" },
            { stationName: "ハウステンボス", lineName: "オオム" },
            { stationName: "早岐", lineName: "サセホ" },
            { stationName: "大塔", lineName: "サセホ" },
            { stationName: "日宇", lineName: "サセホ" },
            { stationName: "佐世保", lineName: null }
        ];
        const fare = calculateFareFromPath(path);
        expect(fare).toBe(1930);
    });
});
