import { useEffect, useState } from "react";
import AdvancedOptions from "@/app/split/components/AdvancedOptions";
import { createEngineClient } from "@/lib/engine-client";
import type { PathStep, Station } from "@/app/types";

interface Props {
  path: PathStep[] | null;
  mode: string;
  isPass: boolean;
  maxSplits: number;
  names: string[];
  onMaxSplitsChange: (value: number) => void;
  onNamesChange: (names: string[]) => void;
}
const asStation = (name: string): Station => ({ name, kana: "", lines: [] });

export default function RouteSplitOptions({ path, mode, isPass, maxSplits, names, onMaxSplitsChange, onNamesChange }: Props) {
  const key = JSON.stringify({ fullPath: path, stationNames: path?.map(step => step.stationName), calculationMode: mode, isPass });
  const [candidates, setCandidates] = useState<{ key: string; names: string[]; error?: string } | null>(null);
  const hasPath = Boolean(path && path.length >= 2);
  useEffect(() => {
    if (!hasPath) return;
    let active = true;
    const client = createEngineClient();
    client.onmessage = event => {
      if (!active || event.data.type === "ready") return;
      if (event.data.type === "success_route_split_candidates") setCandidates({ key, names: Array.isArray(event.data.result) ? event.data.result : event.data.result.names });
      else if (event.data.type === "error") setCandidates({ key, names: [], error: event.data.error });
    };
    const timer = setTimeout(() => {
      void client.ensureReady(isPass ? "pass" : "ticket").then(() => {
        if (active) client.postMessage({ type: "getRouteSplitCandidates", payload: { ...JSON.parse(key), requestId: 1 } });
      }).catch(error => { if (active) setCandidates({ key, names: [], error: String(error) }); });
    }, 150);
    return () => { active = false; clearTimeout(timer); client.terminate(); };
  }, [key, isPass, hasPath]);
  const ready = candidates?.key === key && !candidates.error && Boolean(path);
  useEffect(() => {
    if (!ready || !candidates) return;
    const kept = names.filter(name => candidates.names.includes(name));
    if (kept.length !== names.length) onNamesChange(kept);
  }, [ready, candidates, names, onNamesChange]);
  return <>
    <AdvancedOptions isIcPass={false} stationSelection="checkbox" maxSplits={maxSplits} onMaxSplitsChange={onMaxSplitsChange}
    stations={names.map(asStation)} options={ready ? candidates!.names.map(asStation) : []}
    stationsDisabled={!ready} stationStatus={!path ? "経路を入力すると途中駅を選択できます。" : candidates?.key === key && candidates.error ? `駅一覧を取得できませんでした：${candidates.error}` : !ready ? "経路上の駅を確認しています…" : undefined}
    onStationsChange={stations => onNamesChange(stations.map(station => station.name))} />
  </>;
}
