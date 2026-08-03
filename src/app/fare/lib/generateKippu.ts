import { calculateTotalEigyoKilo, calculateValidDaysFromKilo, convertPathStepsToRouteSegments, generatePrintedViaStrings, whichMajorCitySuburbanSections } from '@/app/utils/calc';
import { load } from '@/app/utils/load';
import { correctPath, uncorrectPath } from '@/app/utils/correctPath';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { cheapestPathAndFare } from '@/app/utils/cheapestPath';

import { RouteRequest, KippuData, PathStep, CalculationMode } from '@/app/types';

interface GenerateKippuOptions {
    calculationMode?: CalculationMode;
}

export function generateKippu(request: RouteRequest, options: GenerateKippuOptions = {}): KippuData {
    const fullPath = request.fullPath;
    const calculationMode = options.calculationMode ?? "normal";

    let correctedPath: PathStep[];
    switch (calculationMode) {
        case "uncorrect":
            correctedPath = uncorrectPath(fullPath);
            break;
        case "cheapest":
            correctedPath = cheapestPathAndFare(fullPath).path;
            break;
        case "normal":
        default:
            correctedPath = correctPath(fullPath);
            break;
    }

    // 大都市近郊区間の判定と運賃取得
    const majorCitySuburbanSection = whichMajorCitySuburbanSections(fullPath);

    if (calculationMode === "cheapest" || calculationMode === "normal") {
        if (majorCitySuburbanSection !== null) {
            return load.getMajorCitySuburbanSectionFares(
                majorCitySuburbanSection,
                fullPath[0].stationName,
                fullPath[fullPath.length - 1].stationName
            );
        }
    }

    // 重複駅チェック
    const allStations = getAllStations(correctedPath);
    const isDuplicateRoute = allStations.length > 1 && new Set(allStations.slice(0, -1)).size !== allStations.length - 1;
    if (isDuplicateRoute) {
        throw new Error("経路が重複しています。");
    }

    // 出発駅と到着駅の名前を取得して変数に代入
    const departureStation = correctedPath[0].stationName;
    const arrivalStation = correctedPath[correctedPath.length - 1].stationName;

    // 営業キロと運賃の計算
    const routeSegments = convertPathStepsToRouteSegments(correctedPath);
    const totalEigyoKilo = calculateTotalEigyoKilo(routeSegments);
    const fare = calculateFareFromPath(correctedPath);
    const validDays = majorCitySuburbanSection === null ? calculateValidDaysFromKilo(totalEigyoKilo) : 1;
    const printedViaLines = generatePrintedViaStrings(correctedPath);

    return {
        totalEigyoKilo,
        departureStation,
        arrivalStation,
        fare,
        printedViaLines,
        validDays
    };
}

const SKIP_SECTION_RULES: string[][] = [
    ["（北）福島", "笹木野", "庭坂", "板谷", "峠", "（奥）大沢", "関根", "米沢"],
    ["米沢", "置賜", "高畠", "赤湯"],
    ["赤湯", "中川", "羽前中山", "かみのやま温泉"],
    ["茂吉記念館前", "蔵王", "山形"],
    ["羽前千歳", "南出羽", "漆山", "高擶", "天童南", "天童"],
    ["天童", "乱川", "神町", "さくらんぼ東根"],
    ["さくらんぼ東根", "東根", "村山"],
    ["村山", "袖崎", "大石田"],
    ["大石田", "北大石田", "芦沢", "舟形", "新庄"],
    ["久留米", "荒木", "西牟田", "羽犬塚", "筑後船小屋"],
    ["熊本", "西熊本", "川尻", "富合", "宇土"],
    ["宇土", "松橋", "小川", "有佐", "千丁", "新八代"],
    ["（鹿）川内", "隈之城", "木場茶屋", "串木野", "神村学園前", "市来", "湯之元", "東市来", "伊集院", "薩摩松元", "上伊集院", "広木", "鹿児島中央"],
    ["神田", "秋葉原", "御徒町", "上野", "王子"],
    ["上野", "鶯谷", "日暮里"],
    ["日暮里", "西日暮里", "田端", "上中里", "東十条", "赤羽"],
    ["赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"],
    ["大宮", "宮原", "上尾", "北上尾", "桶川", "北本", "鴻巣", "北鴻巣", "吹上", "行田", "熊谷"],
    ["越後湯沢", "石打", "（上）大沢", "上越国際スキー場前", "塩沢", "六日町", "五日町", "浦佐"],
    ["浦佐", "八色", "小出", "越後堀之内", "北堀之内", "越後川口", "小千谷", "越後滝谷", "宮内", "長岡"],
    ["熱海", "函南", "三島"],
    ["静岡", "安倍川", "用宗", "焼津", "西焼津", "藤枝", "六合", "（東）島田", "金谷", "菊川", "掛川"],
    ["掛川", "愛野", "袋井", "御厨", "磐田", "豊田町", "天竜川", "浜松"],
    ["浜松", "高塚", "舞阪", "弁天島", "新居町", "鷲津", "新所原", "二川", "豊橋"],
    ["豊橋", "西小坂井", "愛知御津", "三河大塚", "三河三谷", "蒲郡", "三河塩津", "三ケ根", "幸田", "相見", "岡崎", "西岡崎", "安城", "三河安城"],
    ["三河安城", "東刈谷", "野田新町", "刈谷", "逢妻", "大府", "共和", "南大高", "大高", "笠寺", "熱田", "（中）金山"],
    ["（中）金山", "尾頭橋", "名古屋"],
    ["米原", "彦根", "南彦根", "河瀬", "稲枝", "能登川", "安土", "近江八幡", "篠原", "野洲", "守山", "栗東", "草津", "南草津", "（東）瀬田", "石山", "膳所", "大津", "山科"],
    ["京都", "西大路", "（東）桂川", "向日町", "長岡京", "（東）山崎", "島本", "高槻", "摂津富田", "ＪＲ総持寺", "茨木", "千里丘", "岸辺", "吹田", "東淀川", "新大阪"],
    ["西明石", "（陽）大久保", "魚住", "土山", "東加古川", "加古川", "宝殿", "曽根", "ひめじ別所", "御着", "東姫路", "姫路"],
    ["姫路", "手柄山平和公園", "英賀保", "はりま勝原", "網干", "竜野", "相生"],
    ["相生", "有年", "上郡", "三石", "吉永", "和気", "熊山", "万富", "瀬戸", "（陽）上道", "東岡山"],
    ["東岡山", "高島", "西川原", "岡山"],
    ["岡山", "北長瀬", "庭瀬", "中庄", "倉敷"],
    ["倉敷", "西阿知", "新倉敷"],
    ["新倉敷", "金光", "鴨方", "里庄", "笠岡", "大門", "東福山", "福山"],
    ["徳山", "新南陽", "福川", "（陽）戸田", "富海", "防府", "大道", "四辻", "新山口"],
    ["新山口", "嘉川", "本由良", "厚東", "宇部", "小野田", "厚狭"],
    ["厚狭", "埴生", "小月", "長府", "新下関"],
    ["新下関", "幡生", "下関", "門司", "小倉"],
    ["大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山"],
    ["小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮"],
    ["宇都宮", "岡本", "宝積寺"],
    ["宝積寺", "氏家", "蒲須坂", "片岡", "矢板", "（北）野崎", "西那須野", "那須塩原"],
    ["那須塩原", "黒磯", "高久", "黒田原", "豊原", "白坂", "新白河"],
    ["新白河", "白河", "久田野", "泉崎", "矢吹", "鏡石", "須賀川", "安積永盛"],
    ["（北）郡山", "日和田", "五百川", "本宮", "杉田", "二本松", "安達", "松川", "金谷川", "南福島", "（北）福島"],
    ["一ノ関", "山ノ目", "平泉", "前沢", "陸中折居", "水沢", "金ケ崎", "六原", "北上"],
    ["諫早", "西諫早", "喜々津", "市布", "肥前古賀", "現川", "浦上"]
];

function getAllStations(path: PathStep[]): string[] {
    const stations: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
        if (path[i].stationName === "大阪" && path[i].lineName === "シンカ")
            continue;
        stations.push(path[i].stationName);

        const current = path[i];
        const next = path[i + 1];

        const matchedRule = SKIP_SECTION_RULES.find(rule => {
            const first = rule[0];
            const last = rule[rule.length - 1];
            return (
                (first === current.stationName && last === next.stationName) ||
                (last === current.stationName && first === next.stationName)
            );
        });

        if (matchedRule) {
            const intermediates = matchedRule.slice(1, -1);
            if (matchedRule[0] === current.stationName) {
                stations.push(...intermediates);
            } else {
                stations.push(...[...intermediates].reverse());
            }
        }
    }
    if (path.length > 0) {
        stations.push(path[path.length - 1].stationName);
    }
    return stations;
}
