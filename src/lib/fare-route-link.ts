import { parseRoute } from '../app/fare/lib/routeParser.ts';
import stations from '../app/fare/data/stations.json' with { type: 'json' };
import lines from '../app/fare/data/lines.json' with { type: 'json' };

const stationMap = new Map(stations.map(s => [s.name, s]));
const adjacent = new Map<string, { line: typeof lines[number]; start: number; direction: number }[]>();
for (const line of lines) for (let i = 1; i < line.stations.length; i++) {
  for (const direction of [1, -1]) {
    const start = direction === 1 ? i - 1 : i;
    const key = JSON.stringify([line.stations[start], line.stations[start + direction]]);
    const entries = adjacent.get(key) ?? [];
    entries.push({ line, start, direction }); adjacent.set(key, entries);
  }
}

// 収録経路と駅順が一致する区間だけをまとめ、乗換駅をrouteクエリに残す。
export function fareCalculationHref(path: string[], ticketType: string): string {
  let route = path[0];
  for (let i = 0; i < path.length - 1;) {
    const options = adjacent.get(JSON.stringify([path[i], path[i + 1]])) ?? [];
    let selected: { name: string; end: number } | undefined;
    for (const { line, start, direction } of options) {
      let end = i + 1;
      while (end + 1 < path.length && line.stations[start + (end + 1 - i) * direction] === path[end + 1]) end++;
      const name = line.name.split('_')[0];
      const restored = parseRoute(`${path[i]}[${name}]${path[end]}`, [
        stationMap.get(path[i]) ?? { name: path[i], kana: '' },
        stationMap.get(path[end]) ?? { name: path[end], kana: '' },
      ], lines)?.segments[0]?.viaLine;
      if (!restored) continue;
      const startIndex = restored.stations.indexOf(path[i]);
      const endIndex = restored.stations.indexOf(path[end]);
      if (startIndex < 0 || endIndex < 0) continue;
      const expanded = restored.stations.slice(Math.min(startIndex, endIndex), Math.max(startIndex, endIndex) + 1);
      if (startIndex > endIndex) expanded.reverse();
      if (expanded.length !== end - i + 1 || expanded.some((station, offset) => station !== path[i + offset])) continue;
      if (!selected || end > selected.end) selected = { name, end };
    }
    if (!selected) throw new Error(`運賃計算機の路線に対応しない区間です: ${path[i]} → ${path[i + 1]}`);
    route += `[${selected.name.split('_')[0]}]${path[selected.end]}`;
    i = selected.end;
  }
  const page = ticketType === '定期券' ? 'pass' : 'ticket';
  return `/fare/${page}?${new URLSearchParams({ route })}`;
}
