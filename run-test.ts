import * as fs from 'fs';
import { performance } from 'perf_hooks'; // 高精度計測用
import { calcSplit } from '@/app/split/lib/calcSplit';

// 東北本線のリスト（例）
const tohokuMainLineStations: string[] = ["東京", "神田", "秋葉原", "御徒町", "上野", "鶯谷", "日暮里", "尾久", "赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮", "岡本", "宝積寺", "氏家", "蒲須坂", "片岡", "矢板", "（北）野崎", "西那須野", "那須塩原", "黒磯", "高久", "黒田原", "豊原", "白坂", "新白河", "白河", "久田野", "泉崎", "矢吹", "鏡石", "須賀川", "安積永盛", "（北）郡山", "日和田", "五百川", "本宮", "杉田", "二本松", "安達", "松川", "金谷川", "南福島", "（北）福島", "東福島", "伊達", "桑折", "藤田", "貝田", "越河", "（北）白石", "東白石", "北白川", "（北）大河原", "（北）船岡", "槻木", "岩沼", "館腰", "名取", "南仙台", "太子堂", "長町", "仙台"];
const startStation = "東京";
const outputFilePath = 'test_results.txt';

let output = `--- 実行日時: ${new Date().toLocaleString()} ---\n`;
output += `| 到着駅 | 運賃 | 計算時間(ms) | 分割数 |\n`;
output += `| :--- | :--- | :--- | :--- |\n`;

tohokuMainLineStations.forEach((endStation) => {
    try {
        // 計測開始
        const startTime = performance.now();

        // 計算実行
        const result = calcSplit.findOptimalSplitByShortestGiseiKiloPath(startStation, endStation);

        // 計測終了
        const endTime = performance.now();
        const duration = (endTime - startTime).toFixed(3); // 小数点3位まで（ms）

        // Markdownの表形式で整形（後で論文に貼り付けやすくなります）
        // resultオブジェクトのプロパティ名（fareやsplits）はご自身の定義に合わせて調整してください
        output += `${endStation},${result!.shortestData.totalEigyoKilo},${result!.shortestData.fare},${result!.splitKippuDatasList[0].totalFare},${duration}\n`;

        console.log(`${endStation} 完了: ${duration}ms`);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        output += `| ${endStation} | エラー | --- | ${errorMessage} |\n`;
    }
});

fs.writeFileSync(outputFilePath, output, 'utf8');
console.log(`\n結果を ${outputFilePath} に保存しました。`);