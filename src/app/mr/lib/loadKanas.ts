import fs from 'fs';
import path from 'path';

import { createRouteKey } from '@/app/utils/calc';

import { Kana } from '@/app/types';

class LoadKanas {
    private kanas: Map<string, string> = new Map();

    constructor () {
        this.loadKanas();
    }

    private loadKanas() {
        try {

            // kanas.jsonの読み込み
            const kanaList = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'kanas.json');
            const kanaData: Kana[] = JSON.parse(fs.readFileSync(kanaList, 'utf-8'));
            for (const kana of kanaData) {
                const key = createRouteKey(kana.line, kana.station0, kana.station1);
                this.kanas.set(key, kana.kana);
            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getKana(line: string, stationName0: string, stationName1: string): string {
        const key = createRouteKey(line, stationName0, stationName1);
        const kana = this.kanas.get(key);
        if (kana === undefined) {
            throw new Error(` ${key} が見つかりません.`);
        }
        return kana;
    }
}

export const loadKanas = new LoadKanas();