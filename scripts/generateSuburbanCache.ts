import * as fs from 'fs';
import { load } from '@/app/utils/load';
import { KippuData, MajorCitySuburbanSectionFare, PathStep } from '@/app/types';
import { applyOneSideCityRule, applyOneSideYamanoteRule, calculateTotalEigyoKilo, convertPathStepsToRouteSegments, createPairKey, generatePrintedViaStrings } from '@/app/utils/calc';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { applyBoldLineAreaRule, applyKitashinchiRule, applyOsakaRule } from '@/app/utils/correctPath';
import { extendFromCity } from '@/app/utils/cheapestPath';

// ----------------------------------------------------------------------
// 優先度付きキュー
// ----------------------------------------------------------------------
class PriorityQueue {
    private heap: { stationName: string; cost: number }[] = [];
    isEmpty(): boolean { return this.heap.length === 0; }
    enqueue(stationName: string, cost: number): void {
        this.heap.push({ stationName, cost });
        this.bubbleUp(this.heap.length - 1);
    }
    dequeue(): { stationName: string; cost: number } | null {
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop()!;
        const root = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.bubbleDown(0);
        return root;
    }
    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index].cost < this.heap[parentIndex].cost) {
                [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
                index = parentIndex;
            } else { break; }
        }
    }
    private bubbleDown(index: number): void {
        const lastIndex = this.heap.length - 1;
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let smallestIndex = index;
            if (leftChildIndex <= lastIndex && this.heap[leftChildIndex].cost < this.heap[smallestIndex].cost) {
                smallestIndex = leftChildIndex;
            }
            if (rightChildIndex <= lastIndex && this.heap[rightChildIndex].cost < this.heap[smallestIndex].cost) {
                smallestIndex = rightChildIndex;
            }
            if (smallestIndex !== index) {
                [this.heap[index], this.heap[smallestIndex]] = [this.heap[smallestIndex], this.heap[index]];
                index = smallestIndex;
            } else { break; }
        }
    }
}

// ----------------------------------------------------------------------
// キャッシュ生成用クラス
// ----------------------------------------------------------------------

class SuburbanCacheGenerator {
    /**
     * 指定された駅のリストから、全組み合わせの最安KippuDataを計算してJSONに出力します
     */
    public async generateAndSaveCache(stations: string[]) {
        const cacheResult: MajorCitySuburbanSectionFare[] = [];
        const totalStations = stations.length;
        let processedCount = 0;
        const cities = load.getCities();
        const yamanote = load.getYamanote();
        const stationsInYamanote = new Set(yamanote.stations);

        for (let i = 0; i < totalStations; i++) {
            const startStation = stations[i];

            // A→Bの計算のみを行いB→Aの重複計算をスキップ
            for (let j = 0; j < totalStations; j++) {
                const endStation = stations[j];

                if (startStation === endStation) continue;

                // 候補となる経路を1つだけ取得（ダイクストラ法による最短経路）
                const candidatePath = this.findShortestPath(startStation, endStation);
                if (!candidatePath) {
                    console.error(startStation, endStation);
                    continue;
                }

                let correctedPath = candidatePath;

                let centerStation = "東京";
                if (stationsInYamanote.has(startStation) === false && stationsInYamanote.has(endStation) === true) {
                    const shortestPath = this.findShortestPath(startStation, centerStation)!;
                    const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                    const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                    if (1000 < eigyoKilo && eigyoKilo <= 2000) {
                        correctedPath = applyOneSideYamanoteRule(shortestPath, "backward")!;
                    }
                }
                if (stationsInYamanote.has(startStation) === true && stationsInYamanote.has(endStation) === false) {
                    const shortestPath = this.findShortestPath(centerStation, endStation)!;
                    const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                    const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                    if (1000 < eigyoKilo && eigyoKilo <= 2000) {
                        correctedPath = applyOneSideYamanoteRule(shortestPath, "forward")!;
                    }
                }

                for (const city of cities) {
                    switch (city.name) {
                        case "札幌市内":
                            centerStation = "札幌";
                            break;
                        case "仙台市内":
                            centerStation = "仙台";
                            break;
                        case "東京都区内":
                            centerStation = "東京";
                            break;
                        case "横浜市内":
                            centerStation = "横浜";
                            break;
                        case "名古屋市内":
                            centerStation = "名古屋";
                            break;
                        case "京都市内":
                            centerStation = "京都";
                            break;
                        case "大阪市内":
                            centerStation = "大阪";
                            break;
                        case "神戸市内":
                            centerStation = "神戸";
                            break;
                        case "広島市内":
                            centerStation = "広島";
                            break;
                        case "北九州市内":
                            centerStation = "小倉";
                            break;
                        case "福岡市内":
                            centerStation = "博多";
                            break;
                    }
                    const stationsInCity = new Set(city.stations);
                    if (stationsInCity.has(startStation) === false && stationsInCity.has(endStation) === true) {
                        const shortestPath = this.findShortestPath(startStation, centerStation)!;
                        const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                        const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                        if (2000 < eigyoKilo) {
                            correctedPath = applyOneSideCityRule(shortestPath, "backward")!;
                        }
                    }
                    if (stationsInCity.has(startStation) === true && stationsInCity.has(endStation) === false) {
                        const shortestPath = this.findShortestPath(centerStation, endStation)!;
                        const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                        const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                        if (2000 < eigyoKilo) {
                            correctedPath = applyOneSideCityRule(shortestPath, "forward")!;
                        }
                    }
                }
                correctedPath = applyBoldLineAreaRule(correctedPath);
                correctedPath = applyOsakaRule(correctedPath);
                correctedPath = applyKitashinchiRule(correctedPath);

                const kippuData: KippuData = {
                    totalEigyoKilo: calculateTotalEigyoKilo(convertPathStepsToRouteSegments(correctedPath)),
                    departureStation: correctedPath[0].stationName,
                    arrivalStation: correctedPath[correctedPath.length - 1].stationName,
                    printedViaLines: generatePrintedViaStrings(correctedPath),
                    fare: calculateFareFromPath(correctedPath),
                    validDays: 1
                }

                const key = `${startStation}-${endStation}`;
                cacheResult.push({
                    key: key,
                    kippuData: kippuData
                });
            }

            processedCount++;
            console.log(`[Progress] ${processedCount}/${totalStations} 駅完了: ${startStation}`);
        }
        return cacheResult;
    }

    private findShortestPath(startStation: string, endStation: string): PathStep[] | null {
        const firstPathResult = this.findShortestPathByGiseiKilo(startStation, endStation, new Set(), new Set());
        if (!firstPathResult.pathFound) return null;

        const firstPath = this.reconstructPath(firstPathResult.previous, startStation, endStation);
        return firstPath;
    }

    // ----------------------------------------------------------------------
    // ヘルパーメソッド（ダイクストラ法）
    // ----------------------------------------------------------------------
    private findShortestPathByGiseiKilo(
        startStationName: string,
        endStationName: string,
        excludedEdges: Set<string>,
        excludedNodes: Set<string>
    ): { pathFound: boolean; previous: Map<string, { parentStation: string; lineName: string | null; }> } {
        const costs: Map<string, number> = new Map();
        const previous: Map<string, { parentStation: string; lineName: string | null; }> = new Map();
        const pq = new PriorityQueue();

        costs.set(startStationName, 0);
        pq.enqueue(startStationName, 0);

        while (!pq.isEmpty()) {
            const { stationName: currentStation, cost: currentCost } = pq.dequeue()!;
            if (currentCost > (costs.get(currentStation) || Infinity)) continue;
            if (currentStation === endStationName) return { pathFound: true, previous };

            const neighbors = load.getAdjacentStations(currentStation);
            for (const neighborStation of neighbors) {
                if (excludedNodes.has(neighborStation)) continue;
                const edgeKey = createPairKey(currentStation, neighborStation);
                if (excludedEdges.has(edgeKey)) continue;

                const segments = load.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;
                const representativeSegment = segments[0];
                let weight = representativeSegment.giseiKilo;
                if (createPairKey(representativeSegment.station0, representativeSegment.station1) === "南船橋-西船橋")
                    weight = 55;
                if (createPairKey(representativeSegment.station0, representativeSegment.station1) === "千葉みなと-蘇我")
                    weight = 41;
                const newCost = currentCost + weight;

                if (!costs.has(neighborStation) || newCost < (costs.get(neighborStation) || Infinity)) {
                    costs.set(neighborStation, newCost);
                    previous.set(neighborStation, { parentStation: currentStation, lineName: representativeSegment.line });
                    pq.enqueue(neighborStation, newCost);
                }
            }
        }
        return { pathFound: false, previous };
    }

    private reconstructPath(previous: Map<string, { parentStation: string; lineName: string | null; }>, startStationName: string, endStationName: string): PathStep[] | null {
        const path: PathStep[] = [];
        let currentStation = endStationName;
        if (!previous.has(endStationName) && startStationName !== endStationName) return null;
        while (currentStation !== startStationName) {
            const parentInfo = previous.get(currentStation);
            if (!parentInfo) return null;
            path.unshift({ stationName: currentStation, lineName: parentInfo.lineName });
            currentStation = parentInfo.parentStation;
        }
        path.unshift({ stationName: startStationName, lineName: null });
        const finalPath: PathStep[] = [];
        for (let i = 0; i < path.length; i++) {
            if (i === path.length - 1) finalPath.push({ stationName: path[i].stationName, lineName: null });
            else finalPath.push({ stationName: path[i].stationName, lineName: path[i + 1].lineName });
        }
        return finalPath;
    }
}

// ----------------------------------------------------------------------
// 実行部分
// ----------------------------------------------------------------------
async function main() {

    const tokyoSuburbanStations = ["渋川", "金島", "祖母島", "小野上", "小野上温泉", "市城", "中之条", "群馬原町", "郷原", "矢倉", "岩島", "川原湯温泉", "長野原草津口", "群馬大津", "羽根尾", "袋倉", "万座・鹿沢口", "大前", "池袋", "板橋", "十条", "赤羽", "拝島", "熊川", "東秋留", "秋川", "武蔵引田", "武蔵増戸", "武蔵五日市", "熱海", "来宮", "伊豆多賀", "網代", "宇佐美", "伊東", "蘇我", "浜野", "八幡宿", "五井", "姉ケ崎", "長浦", "袖ケ浦", "巌根", "木更津", "君津", "青堀", "大貫", "佐貫町", "上総湊", "竹岡", "浜金谷", "保田", "安房勝山", "岩井", "（房）富浦", "那古船形", "館山", "九重", "千倉", "（房）千歳", "南三原", "和田浦", "江見", "太海", "安房鴨川", "立川", "西立川", "東中神", "中神", "昭島", "牛浜", "福生", "羽村", "小作", "河辺", "東青梅", "青梅", "宮ノ平", "日向和田", "石神前", "二俣尾", "軍畑", "沢井", "御嶽", "川井", "古里", "鳩ノ巣", "白丸", "奥多摩", "松本", "北松本", "島内", "島高松", "梓橋", "一日市場", "中萱", "南豊科", "豊科", "柏矢町", "穂高", "有明", "安曇追分", "細野", "北細野", "信濃松川", "安曇沓掛", "信濃常盤", "南大町", "信濃大町", "北大町", "信濃木崎", "稲尾", "海ノ口", "簗場", "南神城", "神城", "飯森", "白馬", "日暮里", "尾久", "香取", "十二橋", "潮来", "延方", "鹿島神宮", "鹿島サッカースタジアム", "宝積寺", "下野花岡", "（烏）仁井田", "鴻野山", "大金", "小塙", "（烏）滝", "烏山", "大宮", "（川）日進", "西大宮", "指扇", "南古谷", "川越", "西川越", "的場", "笠幡", "武蔵高萩", "高麗川", "祇園", "上総清川", "東清川", "横田", "東横田", "馬来田", "下郡", "小櫃", "俵田", "久留里", "平山", "上総松丘", "上総亀山", "東京", "八丁堀", "越中島", "潮見", "新木場", "葛西臨海公園", "舞浜", "新浦安", "市川塩浜", "二俣新町", "南船橋", "新習志野", "幕張豊砂", "海浜幕張", "検見川浜", "稲毛海岸", "千葉みなと", "西船橋", "小淵沢", "甲斐小泉", "甲斐大泉", "清里", "野辺山", "茅ケ崎", "北茅ケ崎", "香川", "寒川", "宮山", "倉見", "門沢橋", "社家", "厚木", "海老名", "入谷", "相武台下", "下溝", "原当麻", "番田", "上溝", "南橋本", "（横）橋本", "塩尻", "広丘", "村井", "平田", "南松本", "田沢", "明科", "（篠）西条", "坂北", "聖高原", "冠着", "姨捨", "稲荷山", "篠ノ井", "高崎", "高崎問屋町", "井野", "新前橋", "群馬総社", "八木原", "敷島", "津久田", "岩本", "沼田", "後閑", "上牧", "水上", "三河島", "南千住", "北千住", "綾瀬", "亀有", "金町", "松戸", "北松戸", "馬橋", "新松戸", "北小金", "南柏", "柏", "北柏", "我孫子", "天王台", "取手", "藤代", "龍ケ崎市", "牛久", "ひたち野うしく", "荒川沖", "土浦", "神立", "高浜", "石岡", "羽鳥", "岩間", "友部", "内原", "赤塚", "偕楽園", "水戸", "勝田", "佐和", "東海", "大甕", "常陸多賀", "日立", "小木津", "十王", "高萩", "南中郷", "磯原", "大津港", "勿来", "植田", "泉", "湯本", "内郷", "いわき", "（常）草野", "四ツ倉", "久ノ浜", "末続", "（常）広野", "Ｊヴィレッジ", "木戸", "竜田", "富岡", "夜ノ森", "大野", "双葉", "浪江", "北高崎", "群馬八幡", "安中", "磯部", "松井田", "西松井田", "（信）横川", "今井", "川中島", "安茂里", "長野", "常陸青柳", "常陸津田", "後台", "下菅谷", "中菅谷", "上菅谷", "常陸鴻巣", "瓜連", "静", "常陸大宮", "玉川村", "野上原", "山方宿", "中舟生", "下小川", "西金", "上小川", "袋田", "常陸大子", "南酒出", "額田", "河合", "谷河原", "常陸太田", "新日本橋", "馬喰町", "錦糸町", "亀戸", "平井", "新小岩", "小岩", "市川", "本八幡", "下総中山", "船橋", "東船橋", "津田沼", "幕張本郷", "幕張", "新検見川", "稲毛", "西千葉", "千葉", "東千葉", "都賀", "四街道", "物井", "佐倉", "南酒々井", "榎戸", "八街", "日向", "成東", "松尾", "横芝", "飯倉", "八日市場", "干潟", "（総）旭", "飯岡", "倉橋", "猿田", "松岸", "銚子", "御茶ノ水", "秋葉原", "浅草橋", "両国", "本千葉", "鎌取", "誉田", "土気", "大網", "永田", "本納", "新茂原", "茂原", "八積", "上総一ノ宮", "東浪見", "太東", "長者町", "三門", "大原", "浪花", "御宿", "勝浦", "鵜原", "上総興津", "行川アイランド", "安房小湊", "安房天津", "宮原", "上尾", "北上尾", "桶川", "北本", "鴻巣", "北鴻巣", "吹上", "行田", "熊谷", "籠原", "深谷", "岡部", "本庄", "神保原", "新町", "倉賀野", "神田", "水道橋", "飯田橋", "市ケ谷", "四ツ谷", "信濃町", "千駄ケ谷", "代々木", "新宿", "（中）大久保", "東中野", "中野", "高円寺", "阿佐ケ谷", "荻窪", "西荻窪", "吉祥寺", "三鷹", "武蔵境", "東小金井", "武蔵小金井", "国分寺", "西国分寺", "国立", "日野", "豊田", "八王子", "西八王子", "高尾", "相模湖", "藤野", "上野原", "四方津", "梁川", "鳥沢", "猿橋", "大月", "初狩", "笹子", "甲斐大和", "勝沼ぶどう郷", "塩山", "東山梨", "山梨市", "春日居町", "石和温泉", "酒折", "甲府", "竜王", "塩崎", "韮崎", "新府", "穴山", "日野春", "長坂", "信濃境", "富士見", "すずらんの里", "青柳", "茅野", "上諏訪", "下諏訪", "岡谷", "みどり湖", "川岸", "辰野", "信濃川島", "（中）小野", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川", "御徒町", "上野", "鶯谷", "大崎", "五反田", "目黒", "恵比寿", "渋谷", "原宿", "新大久保", "高田馬場", "目白", "大塚", "巣鴨", "駒込", "田端", "西日暮里", "鶴見", "国道", "鶴見小野", "弁天橋", "浅野", "安善", "武蔵白石", "浜川崎", "昭和", "扇町", "新芝浦", "海芝浦", "大川", "大井町", "大森", "蒲田", "川崎", "新子安", "東神奈川", "横浜", "保土ケ谷", "東戸塚", "戸塚", "大船", "藤沢", "辻堂", "平塚", "大磯", "二宮", "国府津", "鴨宮", "小田原", "早川", "根府川", "真鶴", "湯河原", "羽沢横浜国大", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮", "岡本", "氏家", "蒲須坂", "片岡", "矢板", "（北）野崎", "西那須野", "那須塩原", "黒磯", "上中里", "王子", "東十条", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "酒々井", "成田", "久住", "滑河", "下総神崎", "大戸", "佐原", "水郷", "小見川", "笹川", "下総橘", "下総豊里", "椎柴", "下総松崎", "安食", "（成）小林", "木下", "布佐", "新木", "湖北", "東我孫子", "空港第２ビル", "成田空港", "尻手", "矢向", "鹿島田", "平間", "向河原", "武蔵小杉", "武蔵中原", "武蔵新城", "武蔵溝ノ口", "津田山", "久地", "宿河原", "登戸", "中野島", "稲田堤", "矢野口", "稲城長沼", "南多摩", "府中本町", "分倍河原", "西府", "谷保", "矢川", "西国立", "八丁畷", "川崎新町", "小田栄", "鶴田", "鹿沼", "文挟", "下野大沢", "今市", "日光", "桜木町", "関内", "石川町", "山手", "（岸）根岸", "磯子", "新杉田", "洋光台", "港南台", "本郷台", "北八王子", "小宮", "東福生", "箱根ケ崎", "金子", "東飯能", "毛呂", "越生", "明覚", "小川町", "竹沢", "折原", "寄居", "用土", "松久", "児玉", "丹荘", "群馬藤岡", "北藤岡", "西大井", "新川崎", "小田林", "結城", "東結城", "川島", "玉戸", "下館", "新治", "大和", "岩瀬", "羽黒", "福原", "稲田", "笠間", "宍戸", "北府中", "新小平", "新秋津", "東所沢", "新座", "北朝霞", "西浦和", "東浦和", "東川口", "南越谷", "越谷レイクタウン", "吉川", "吉川美南", "新三郷", "（武蔵）三郷", "南流山", "新八柱", "東松戸", "市川大野", "船橋法典", "北鎌倉", "鎌倉", "逗子", "東逗子", "田浦", "横須賀", "衣笠", "久里浜", "大口", "菊名", "新横浜", "小机", "鴨居", "中山", "十日市場", "長津田", "成瀬", "町田", "古淵", "淵野辺", "矢部", "相模原", "相原", "八王子みなみ野", "片倉", "思川", "栃木", "大平下", "岩舟", "佐野", "（両）富田", "あしかがフラワーパーク", "足利", "山前", "小俣", "桐生", "岩宿", "国定", "伊勢崎", "駒形", "前橋大島", "前橋"];
    const osakaSuburbanStations = ["相生", "西相生", "坂越", "播州赤穂", "大阪", "天満", "桜ノ宮", "京橋", "大阪城公園", "森ノ宮", "玉造", "鶴橋", "桃谷", "寺田町", "天王寺", "（環）福島", "野田", "西九条", "弁天町", "大正", "芦原橋", "今宮", "久宝寺", "新加美", "衣摺加美北", "ＪＲ長瀬", "ＪＲ俊徳道", "ＪＲ河内永和", "高井田中央", "放出", "鴫野", "ＪＲ野江", "城北公園通", "ＪＲ淡路", "南吹田", "新大阪", "加古川", "日岡", "神野", "厄神", "市場", "小野町", "粟生", "河合西", "青野ケ原", "社町", "滝野", "（加）滝", "西脇市", "新西脇", "比延", "日本へそ公園", "黒田庄", "本黒田", "船町口", "久下村", "谷川", "木津", "西木津", "祝園", "下狛", "ＪＲ三山木", "同志社前", "京田辺", "大住", "松井山手", "長尾", "藤阪", "津田", "河内磐船", "星田", "寝屋川公園", "忍ケ丘", "四条畷", "（片）野崎", "住道", "鴻池新田", "徳庵", "日根野", "りんくうタウン", "関西空港", "柘植", "新堂", "佐那具", "伊賀上野", "島ケ原", "月ケ瀬口", "（関）大河原", "笠置", "（関）加茂", "平城山", "奈良", "（関）郡山", "大和小泉", "法隆寺", "王寺", "（関）三郷", "河内堅上", "高井田", "（関）柏原", "志紀", "八尾", "加美", "平野", "東部市場前", "新今宮", "ＪＲ難波", "油日", "甲賀", "寺庄", "甲南", "貴生川", "三雲", "甲西", "石部", "手原", "草津", "山科", "大津京", "唐崎", "比叡山坂本", "おごと温泉", "堅田", "（湖）小野", "和邇", "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原", "近江塩津", "安治川口", "ユニバーサルシティ", "桜島", "京終", "帯解", "櫟本", "天理", "長柄", "柳本", "巻向", "三輪", "桜井", "香久山", "畝傍", "金橋", "（和）高田", "京都", "梅小路京都西", "丹波口", "二条", "円町", "花園", "太秦", "嵯峨嵐山", "保津峡", "馬堀", "亀岡", "並河", "千代川", "八木", "（陰）吉富", "園部", "神戸", "兵庫", "新長田", "鷹取", "須磨海浜公園", "須磨", "塩屋", "垂水", "舞子", "朝霧", "明石", "西明石", "（陽）大久保", "魚住", "土山", "東加古川", "宝殿", "曽根", "ひめじ別所", "御着", "東姫路", "姫路", "手柄山平和公園", "英賀保", "はりま勝原", "網干", "竜野", "和田岬", "米原", "彦根", "南彦根", "河瀬", "稲枝", "能登川", "安土", "近江八幡", "篠原", "野洲", "守山", "栗東", "南草津", "（東）瀬田", "石山", "膳所", "大津", "西大路", "（東）桂川", "向日町", "長岡京", "（東）山崎", "島本", "高槻", "摂津富田", "ＪＲ総持寺", "茨木", "千里丘", "岸辺", "吹田", "東淀川", "塚本", "尼崎", "立花", "甲子園口", "西宮", "さくら夙川", "芦屋", "甲南山手", "摂津本山", "（東）住吉", "六甲道", "摩耶", "灘", "三ノ宮", "元町", "大阪城北詰", "大阪天満宮", "北新地", "新福島", "海老江", "御幣島", "加島", "上狛", "棚倉", "玉水", "山城多賀", "山城青谷", "長池", "城陽", "（奈）新田", "ＪＲ小倉", "宇治", "黄檗", "木幡", "六地蔵", "桃山", "ＪＲ藤森", "稲荷", "東福寺", "美章園", "南田辺", "鶴ケ丘", "長居", "我孫子町", "杉本町", "浅香", "堺市", "三国ケ丘", "百舌鳥", "上野芝", "津久野", "鳳", "富木", "北信太", "信太山", "和泉府中", "久米田", "（阪）下松", "東岸和田", "東貝塚", "和泉橋本", "東佐野", "熊取", "長滝", "新家", "和泉砂川", "和泉鳥取", "山中渓", "紀伊", "六十谷", "紀伊中ノ島", "和歌山", "東羽衣", "塚口", "猪名寺", "伊丹", "北伊丹", "川西池田", "中山寺", "宝塚", "生瀬", "西宮名塩", "武田尾", "道場", "三田", "新三田", "（福）広野", "相野", "藍本", "（福）草野", "古市", "南矢代", "篠山口", "丹波大山", "下滝", "坂田", "田村", "長浜", "虎姫", "河毛", "高月", "木ノ本", "余呉", "畠田", "志都美", "香芝", "ＪＲ五位堂", "（和）高田", "大和新庄", "御所", "玉手", "掖上", "吉野口", "北宇智", "五条", "大和二見", "隅田", "下兵庫", "（和）橋本", "紀伊山田", "高野口", "中飯降", "妙寺", "大谷", "笠田", "西笠田", "名手", "粉河", "紀伊長田", "打田", "下井阪", "岩出", "船戸", "紀伊小倉", "布施屋", "千旦", "田井ノ瀬"];
    const fukuokaSuburbanStations = ["門司港", "小森江", "門司", "小倉", "西小倉", "九州工大前", "戸畑", "枝光", "スペースワールド", "八幡", "黒崎", "陣原", "折尾", "水巻", "遠賀川", "海老津", "教育大前", "赤間", "東郷", "東福間", "福間", "千鳥", "古賀", "ししぶ", "新宮中央", "福工大前", "九産大前", "香椎", "千早", "箱崎", "吉塚", "博多", "竹下", "笹原", "南福岡", "春日", "大野城", "水城", "都府楼南", "二日市", "天拝山", "原田", "けやき台", "基山", "弥生が丘", "田代", "鳥栖", "香椎神宮", "舞松原", "土井", "伊賀", "長者原", "酒殿", "須恵", "須恵中央", "新原", "宇美", "和白", "奈多", "雁ノ巣", "海ノ中道", "西戸崎", "新飯塚", "上三緒", "下鴨生", "筑前庄内", "船尾", "田川後藤寺", "柚須", "原町", "門松", "篠栗", "筑前山手", "城戸南蔵院前", "九郎原", "筑前大分", "（筑豊）桂川", "東水巻", "中間", "筑前垣生", "鞍手", "筑前植木", "新入", "直方", "勝野", "小竹", "鯰田", "浦田", "飯塚", "天道", "上穂波", "筑前内野", "筑前山家", "若松", "藤ノ木", "奥洞海", "二島", "本城", "南小倉", "城野", "安部山公園", "下曽根", "朽網", "苅田", "小波瀬西工大前", "行橋", "博多南", "石田", "志井公園", "志井", "石原町", "呼野", "採銅所", "香春", "一本松", "田川伊田", "池尻", "豊前川崎", "西添田", "添田"];
    const niigataSuburbanStations = ["新津", "京ケ瀬", "水原", "神山", "月岡", "中浦", "新発田", "加治", "金塚", "中条", "平木田", "坂町", "平林", "岩船町", "村上", "柏崎", "東柏崎", "西中通", "荒浜", "刈羽", "西山", "礼拝", "石地", "小木ノ城", "出雲崎", "妙法寺", "小島谷", "桐原", "寺泊", "分水", "粟生津", "南吉田", "吉田", "北吉田", "岩室", "巻", "越後曽根", "越後赤塚", "内野西が丘", "内野", "新潟大学前", "寺尾", "小針", "青山", "関屋", "白山", "上所", "新潟", "小千谷", "越後滝谷", "宮内", "直江津", "（信）黒井", "犀潟", "土底浜", "潟町", "上下浜", "柿崎", "米山", "笠島", "青海川", "鯨波", "茨目", "安田", "北条", "越後広田", "長鳥", "塚山", "越後岩塚", "来迎寺", "前川", "長岡", "北長岡", "押切", "見附", "帯織", "東光寺", "三条", "東三条", "保内", "（信）加茂", "羽生田", "田上", "矢代田", "古津", "さつき野", "荻川", "亀田", "越後石山", "西新発田", "佐々木", "黒山", "豊栄", "早通", "新崎", "大形", "東新潟", "五泉", "北五泉", "新関", "東新津", "弥彦", "矢作", "西燕", "燕", "燕三条", "北三条"];
    const sendaiSuburbanStations = ["北山形", "東金井", "羽前山辺", "羽前金沢", "羽前長崎", "南寒河江", "寒河江", "西寒河江", "羽前高松", "柴橋", "左沢", "小牛田", "上涌谷", "涌谷", "前谷地", "佳景山", "鹿又", "曽波神", "石巻", "陸前稲井", "渡波", "万石浦", "沢田", "浦宿", "女川", "（北）福島", "笹木野", "庭坂", "板谷", "峠", "（奥）大沢", "関根", "米沢", "置賜", "高畠", "赤湯", "中川", "羽前中山", "かみのやま温泉", "茂吉記念館前", "蔵王", "山形", "羽前千歳", "南出羽", "漆山", "高擶", "天童南", "天童", "乱川", "神町", "さくらんぼ東根", "東根", "村山", "袖崎", "大石田", "北大石田", "芦沢", "舟形", "新庄", "小高", "磐城太田", "原ノ町", "鹿島", "日立木", "相馬", "駒ケ嶺", "新地", "坂元", "山下", "浜吉田", "亘理", "逢隈", "岩沼", "仙台", "東照宮", "北仙台", "北山", "東北福祉大前", "国見", "葛岡", "陸前落合", "愛子", "陸前白沢", "熊ケ根", "作並", "奥新川", "面白山高原", "山寺", "（仙山）高瀬", "楯山", "あおば通", "榴ケ岡", "宮城野原", "陸前原ノ町", "苦竹", "小鶴新田", "福田町", "陸前高砂", "中野栄", "多賀城", "下馬", "西塩釜", "本塩釜", "東塩釜", "陸前浜田", "松島海岸", "高城町", "手樽", "陸前富山", "陸前大塚", "東名", "野蒜", "陸前小野", "鹿妻", "矢本", "東矢本", "陸前赤井", "石巻あゆみ野", "蛇田", "陸前山下", "矢吹", "鏡石", "須賀川", "安積永盛", "（北）郡山", "日和田", "五百川", "本宮", "杉田", "二本松", "安達", "松川", "金谷川", "南福島", "東福島", "伊達", "桑折", "藤田", "貝田", "越河", "（北）白石", "東白石", "北白川", "（北）大河原", "（北）船岡", "槻木", "館腰", "名取", "南仙台", "太子堂", "長町", "東仙台", "岩切", "陸前山王", "国府多賀城", "塩釜", "松島", "愛宕", "品井沼", "鹿島台", "松山町", "田尻", "瀬峰", "梅ケ沢", "（北）新田", "石越", "油島", "花泉", "清水原", "有壁", "一ノ関", "山ノ目", "平泉", "新利府", "利府", "郡山富田", "喜久田", "安子ケ島", "磐梯熱海", "中山宿", "上戸", "猪苗代湖畔", "関都", "川桁", "猪苗代", "翁島", "磐梯町", "東長原", "広田", "会津若松", "堂島", "笈川", "塩川", "姥堂", "会津豊川", "喜多方", "船引", "要田", "三春", "舞木", "北浦", "陸前谷地", "古川", "塚目", "西古川", "東大崎", "西大崎", "岩出山", "有備館", "上野目", "池月", "川渡温泉", "鳴子御殿湯", "鳴子温泉", "中山平温泉", "堺田", "赤倉温泉", "立小路", "最上", "大堀", "鵜杉", "瀬見温泉", "東長沢", "長沢", "南新庄"];

    const generator = new SuburbanCacheGenerator();

    console.time("CacheGenerationTime");

    const result = {
        "東京近郊区間": await generator.generateAndSaveCache(tokyoSuburbanStations),
        "大阪近郊区間": await generator.generateAndSaveCache(osakaSuburbanStations),
        "福岡近郊区間": await generator.generateAndSaveCache(fukuokaSuburbanStations),
        "新潟近郊区間": await generator.generateAndSaveCache(niigataSuburbanStations),
        "仙台近郊区間": await generator.generateAndSaveCache(sendaiSuburbanStations)
    };

    // 一つのJSONファイルとして書き出し
    fs.writeFileSync("./src/data/majorCitySuburbanSectionFares.json", JSON.stringify(result, null, 2), 'utf-8');

    console.timeEnd("CacheGenerationTime");
}

main().catch(error => {
    console.error("エラーが発生しました:", error);
});
