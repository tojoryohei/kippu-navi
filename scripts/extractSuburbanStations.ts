import { Section } from '@/app/types';
import * as fs from 'fs';
import * as path from 'path';

function extractUniqueStations() {
    const inputFilePath = path.join(process.cwd(), 'src/data/majorCitySuburbanSections.json');
    const outputFilePath = path.join(process.cwd(), 'scripts/all_suburban_stations.json');

    const EXCLUDED_NAMES = [
        "東京都区内",
        "東京山手線内",
        "札幌市内",
        "仙台市内",
        "横浜市内",
        "名古屋市内",
        "京都市内",
        "大阪市内",
        "大阪・新大阪",
        "神戸市内",
        "広島市内",
        "北九州市内",
        "福岡市内"
    ];

    try {
        const rawData = fs.readFileSync(inputFilePath, 'utf-8');
        const parsedData: Record<string, Section[]> = JSON.parse(rawData);

        const result: Record<string, string[]> = {};
        let totalStationsCount = 0;

        for (const [areaName, segments] of Object.entries(parsedData)) {
            const uniqueStationsSet = new Set<string>();

            if (Array.isArray(segments)) {
                for (const segment of segments) {
                    if (segment.station0) uniqueStationsSet.add(segment.station0);
                    if (segment.station1) uniqueStationsSet.add(segment.station1);
                }
            }

            EXCLUDED_NAMES.forEach(name => uniqueStationsSet.delete(name));

            const uniqueStationsArray = Array.from(uniqueStationsSet);

            result[areaName] = uniqueStationsArray;
            totalStationsCount += uniqueStationsArray.length;
        }

        // JSON文字列の構築
        let outputString = "{\n";
        const entries = Object.entries(result);

        entries.forEach(([areaName, stations], index) => {
            const isLast = index === entries.length - 1;
            outputString += `  "${areaName}": ${JSON.stringify(stations)}${isLast ? '' : ','}\n`;
        });
        outputString += "}\n";

        fs.writeFileSync(outputFilePath, outputString, 'utf-8');

        console.log(`✅ 抽出完了: 全 ${entries.length} 区間、計 ${totalStationsCount} 駅のデータを保存しました。`);

    } catch (error) {
        console.error('エラーが発生しました:', error);
    }
}

// 実行
extractUniqueStations();
