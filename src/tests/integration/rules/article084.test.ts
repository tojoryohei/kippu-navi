import { describe, it, expect } from "vitest";
import { calculateFareFromPath } from "@/app/utils/calcFare";
import { PathStep } from "@/app/types";

describe("第84条 営業キロが10キロメートルまでの普通旅客運賃", () => {
    describe("（1）幹線内相互発着の場合（電車特定区間内相互発着の場合を除く。）", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("長門市-仙崎 2.2キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "長門市", lineName: "サンイ２" },
                    { stationName: "仙崎", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(150);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("和歌山-和歌山市 3.3キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "和歌山", lineName: "キセイ" },
                    { stationName: "紀和", lineName: "キセイ" },
                    { stationName: "和歌山市", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(190);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("上夜久野-下夜久野 7.4キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "上夜久野", lineName: "サンイ" },
                    { stationName: "下夜久野", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(200);
            });
        });
    });

    describe("（2）電車特定区間内相互発着の場合", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("鳳-東羽衣 1.7キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "鳳", lineName: "ハンワ２" },
                    { stationName: "東羽衣", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(150);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("西九条-桜島 4.1キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "西九条", lineName: "サクシ" },
                    { stationName: "安治川口", lineName: "サクシ" },
                    { stationName: "ユニバーサルシティ", lineName: "サクシ" },
                    { stationName: "桜島", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(180);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("大津-大津京 9.9キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "大津", lineName: "トウカ" },
                    { stationName: "山科", lineName: "コセイ" },
                    { stationName: "大津京", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(200);
            });
        });
    });

    describe("（3）地方交通線内相互発着の場合及び幹線と地方交通線を連続して乗車する場合", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("市川大門-市川本町 0.9キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "市川大門", lineName: "ミノフ" },
                    { stationName: "市川本町", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(150);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("居能-雀田 4.5キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "居能", lineName: "オノタ" },
                    { stationName: "妻崎", lineName: "オノタ" },
                    { stationName: "長門長沢", lineName: "オノタ" },
                    { stationName: "雀田", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(190);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("東舞鶴-西舞鶴 6.9キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "東舞鶴", lineName: "マイツ" },
                    { stationName: "西舞鶴", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(210);
            });
        });
    });
});

describe("第84条の２ 北海道旅客鉄道会社内の営業キロが10キロメートルまでの普通旅客運賃", () => {
    describe("（1）幹線内相互発着の場合", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("札幌-苗穂 1.9キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "札幌", lineName: "ハコタ" },
                    { stationName: "苗穂", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(210);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("函館-五稜郭 3.4キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "函館", lineName: "ハコタ" },
                    { stationName: "五稜郭", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(270);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("苫小牧-沼ノ端 8.8キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "苫小牧", lineName: "ムロラ" },
                    { stationName: "沼ノ端", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(310);
            });
        });
    });

    describe("（2）地方交通線内相互発着の場合及び幹線と地方交通線を連続して乗車する場合", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("あいの里教育大-あいの里公園 1.5キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "あいの里教育大", lineName: "サツシ" },
                    { stationName: "あいの里公園", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(210);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("旭川-新旭川 3.7キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "旭川", lineName: "ソウヤ" },
                    { stationName: "旭川四条", lineName: "ソウヤ" },
                    { stationName: "新旭川", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(270);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("中富良野-上富良野 7.6キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "中富良野", lineName: "フラノ" },
                    { stationName: "ラベンダー畑", lineName: "フラノ" },
                    { stationName: "西中", lineName: "フラノ" },
                    { stationName: "上富良野", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(320);
            });
        });
    });
});

describe("第84条の３ 東日本旅客鉄道会社内の営業キロが10キロメートルまでの普通旅客運賃", () => {
    describe("（1）幹線内相互発着の場合", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("高城町-松島 0.3キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "高城町", lineName: "トウホ６" },
                    { stationName: "松島", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(160);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("岩切-利府 4.2キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "岩切", lineName: "トウホ３" },
                    { stationName: "新利府", lineName: "トウホ３" },
                    { stationName: "利府", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(200);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("鶴見-羽沢横浜国大 8.8キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "鶴見", lineName: "トウカ３" },
                    { stationName: "羽沢横浜国大", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(210);
            });
        });
    });

    describe("（2）地方交通線内相互発着の場合及び幹線と地方交通線を連続して乗車する場合", () => {
        describe("イ　営業キロが3キロメートル以下の場合", () => {
            it("白馬-飯森 3.0キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "白馬", lineName: "オオイ" },
                    { stationName: "飯森", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(160);
            });
        });

        describe("ロ　営業キロが4キロメートルから6キロメートルまでの場合", () => {
            it("甲斐大泉-甲斐小泉 5.1キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "甲斐大泉", lineName: "コウミ" },
                    { stationName: "甲斐小泉", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(200);
            });
        });

        describe("ハ 営業キロが7キロメートルから10キロメートルまでの場合", () => {
            it("小牛田-古川 9.4キロメートル", () => {
                const path: PathStep[] = [
                    { stationName: "小牛田", lineName: "リクト" },
                    { stationName: "北浦", lineName: "リクト" },
                    { stationName: "陸前谷地", lineName: "リクト" },
                    { stationName: "古川", lineName: null }
                ];
                const fare = calculateFareFromPath(path);
                expect(fare).toBe(220);
            });
        });
    });
});

describe("第84条の４ 四国旅客鉄道会社内の営業キロが10キロメートルまでの普通旅客運賃", () => {
    describe("イ　営業キロ・擬制キロが3キロメートル以下の場合", () => {
        it("佃-辻 1.5キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "佃", lineName: "トクシ" },
                { stationName: "辻", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(190);
        });
    });

    describe("ロ　営業キロ・擬制キロが4キロメートルから6キロメートルまでの場合", () => {
        it("大歩危-小歩危 5.7キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "大歩危", lineName: "トサン" },
                { stationName: "小歩危", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(240);
        });
    });

    describe("ハ 営業キロ・擬制キロが7キロメートルから10キロメートルまでの場合", () => {
        it("徳島-（徳）府中 6.6キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "徳島", lineName: "コウト" },
                { stationName: "佐古", lineName: "トクシ" },
                { stationName: "蔵本", lineName: "トクシ" },
                { stationName: "鮎喰", lineName: "トクシ" },
                { stationName: "（徳）府中", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(280);
        });
    });
});

describe("第84条の５ 九州旅客鉄道会社内の営業キロが10キロメートルまでの普通旅客運賃", () => {
    describe("イ　営業キロ・擬制キロが3キロメートル以下の場合", () => {
        it("福工大前-九産大前 3.0キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "福工大前", lineName: "カコシ" },
                { stationName: "九産大前", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(200);
        });
    });

    describe("ロ　営業キロ・擬制キロが4キロメートルから6キロメートルまでの場合", () => {
        it("久留米高校前-久留米大学前 3.4キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "久留米高校前", lineName: "キユウ" },
                { stationName: "南久留米", lineName: "キユウ" },
                { stationName: "久留米大学前", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(240);
        });
    });

    describe("ハ 営業キロ・擬制キロが7キロメートルから10キロメートルまでの場合", () => {
        it("鳥栖-久留米 7.1キロメートル", () => {
            const path: PathStep[] = [
                { stationName: "鳥栖", lineName: "カコシ" },
                { stationName: "肥前旭", lineName: "カコシ" },
                { stationName: "久留米", lineName: null }
            ];
            const fare = calculateFareFromPath(path);
            expect(fare).toBe(270);
        });
    });
});
