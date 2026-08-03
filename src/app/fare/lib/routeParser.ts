import { Station, Line } from '@/app/types';

export interface FormSegmentInput {
    viaLine: Line | null;
    destinationStation: Station | null;
}

export interface ParsedRouteResult {
    startStation: Station | null;
    segments: FormSegmentInput[];
}

/**
 * フォームの入力状態から URL の `route` クエリ文字列を生成する
 * 路線名の `_` 以降（例: 山手線　外_東京 -> 山手線　外）を除去して出力する
 */
export function stringifyRoute(
    startStation: Station | null,
    segments: FormSegmentInput[]
): string {
    if (!startStation?.name) return "";

    let route = startStation.name;
    for (const seg of segments) {
        if (seg.viaLine?.name) {
            const displayName = seg.viaLine.name.split('_')[0];
            route += `[${displayName}]`;
        }
        if (seg.destinationStation?.name) {
            route += seg.destinationStation.name;
        }
    }
    return route;
}

/**
 * URL の `route` クエリ文字列からフォームの入力状態を復元する
 * 表示用路線名（例: 山手線　外）から回り方を崩さずに内部路線名（例: 山手線　外_東京）を照合する
 */
export function parseRoute(
    routeStr: string,
    stationData: Station[],
    lineData: Line[]
): ParsedRouteResult | null {
    if (!routeStr || typeof routeStr !== "string") return null;

    const trimmed = routeStr.trim();
    if (!trimmed) return null;

    const parts = trimmed.split(/\[(.*?)\]/);

    if (parts.length < 3 || (parts.length - 1) % 2 !== 0) {
        const singleStation = stationData.find(s => s.name === trimmed);
        if (singleStation) {
            return { startStation: singleStation, segments: [] };
        }
        return null;
    }

    const stationMap = new Map<string, Station>(stationData.map(s => [s.name, s]));
    const startStationName = parts[0];
    const startStation = (startStationName && startStationName.trim() !== "")
        ? (stationMap.get(startStationName) || { name: startStationName, kana: "" })
        : null;

    const segments: FormSegmentInput[] = [];
    let currentStationName = startStationName;

    for (let i = 1; i < parts.length; i += 2) {
        const rawLineName = parts[i];
        const destStationName = parts[i + 1];
        const destStation = (destStationName && destStationName.trim() !== "")
            ? (stationMap.get(destStationName) || { name: destStationName, kana: "" })
            : null;

        let matchedLine: Line | null = null;

        if (rawLineName && rawLineName.trim() !== "") {
            matchedLine = lineData.find(l => l.name === rawLineName) || null;

            if (!matchedLine) {
                const candidates = lineData.filter(l => l.name.split('_')[0] === rawLineName || l.name.startsWith(rawLineName));
                if (candidates.length === 1) {
                    matchedLine = candidates[0];
                } else if (candidates.length > 1) {
                    const prevStationObj = stationMap.get(currentStationName);
                    const prevLines = prevStationObj?.lines || [];
                    const exactStationLine = candidates.find(l => prevLines.includes(l.name));
                    if (exactStationLine) {
                        matchedLine = exactStationLine;
                    } else {
                        const bothIncluded = candidates.find(l =>
                            l.stations?.includes(currentStationName) && (destStationName ? l.stations?.includes(destStationName) : true)
                        );
                        if (bothIncluded) {
                            matchedLine = bothIncluded;
                        } else {
                            const prevIncluded = candidates.find(l => l.stations?.includes(currentStationName));
                            matchedLine = prevIncluded || candidates[0];
                        }
                    }
                }
            }
        }

        segments.push({
            viaLine: matchedLine,
            destinationStation: destStation,
        });

        currentStationName = destStationName;
    }

    return {
        startStation,
        segments,
    };
}
