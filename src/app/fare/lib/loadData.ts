import kanaData from '@/app/fare/data/kanas.json';
import linesData from '@/app/fare/data/lines.json';
import type { Kana, Line } from '@/app/types';

function createRouteKey(line: string, station0: string, station1: string): string {
    return [line, ...[station0, station1].sort()].join('-');
}

const kanas = new Map<string, string>();
// kanas.jsonの数字コードは、定期券計算で扱えない会社線（私鉄・第三セクター線）を示す。
const privateLineNames = new Set(
    (kanaData as Kana[])
        .filter(({ kana }) => /^\d/.test(kana))
        .map(({ line }) => line),
);

try {
    for (const kana of kanaData as Kana[]) {
        const key = createRouteKey(kana.line, kana.station0, kana.station1);
        kanas.set(key, kana.kana);
    }
} catch (error) {
    console.error('kanas.jsonの読み込みエラー：', error);
}

const lines = new Map<string, Line>();
try {
    for (const line of linesData as Line[]) {
        lines.set(line.name, line);
    }
} catch (error) {
    console.error('lines.jsonの読み込みエラー：', error);
}

export function getKana(line: string, stationName0: string, stationName1: string): string {
    const key = createRouteKey(line, stationName0, stationName1);
    const kana = kanas.get(key);
    if (kana === undefined) {
        throw new Error(` ${key} が見つかりません.`);
    }
    return kana;
}

export function getLineByName(name: string): Line {
    const line = lines.get(name);
    if (line === undefined) {
        throw new Error(` ${name} が見つかりません.`);
    }
    return line;
}

export function isPrivateRailwayLine(lineName: string): boolean {
    return privateLineNames.has(lineName.split('_')[0]);
}

export function isShinkansen(lineName: string): boolean {
    return lineName.includes('新幹');
}
