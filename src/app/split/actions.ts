"use server";

import { getOptimalSplitWithCache } from "@/app/split/lib/getOptimalSplitWithCache";
import { StationCountLimitExceededError, RouteNotFoundError } from "@/app/utils/errors";
import stationDatas from "@/app/split/data/stationDatas.json";

const STATION_NAMES = new Set(stationDatas.map((s) => s.name));
const TEMPORARY_STATIONS = [
  "原生花園",
  "ラベンダー畑",
  "細岡",
  "猪苗代湖畔",
  "ガーラ湯沢",
  "偕楽園",
  "鹿島サッカースタジアム",
  "津島ノ宮",
  "田井ノ浜",
  "バルーンさが",
];

async function fetchPassApi(from: string, to: string, months: number, isIc: boolean) {
  const start = performance.now();
  const endpoint = isIc
    ? "https://split-pass-api-yvgda2swha-an.a.run.app/api/split-ic-pass"
    : "https://split-pass-api-yvgda2swha-an.a.run.app/api/split-pass";

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: from, end: to, months }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "サーバー内部でエラーが発生しました。");
  }

  const data = await response.json();

  if (data.error) {
    throw new Error(data.error);
  }

  return {
    result: {
      passStations: {
        normal: data.normal || [],
        results: data.results || []
      }
    },
    serverTime: performance.now() - start
  };
}

export async function calculateAction(from: string, to: string, searchType: string, isIc: boolean) {
  if (from === to) {
    return { error: "出発駅と到着駅が同じです。" };
  }

  if (!STATION_NAMES.has(from) || !STATION_NAMES.has(to)) {
    return { error: "駅名が正しくありません。正しい駅名を選択または入力してください。" };
  }

  // IC定期券の時の追加バリデーション
  if (isIc) {
    const fromStation = stationDatas.find(s => s.name === from);
    const toStation = stationDatas.find(s => s.name === to);

    if (!fromStation?.icPassAreaName || !toStation?.icPassAreaName) {
      return { error: "出発駅と到着駅の両方がIC定期券エリア（Suicaエリアなど）の駅である必要があります。" };
    }

    if (fromStation.icPassAreaName !== toStation.icPassAreaName) {
      return { error: `異なるIC定期券エリア（${fromStation.icPassAreaName}と${toStation.icPassAreaName}）をまたぐ計算はできません。` };
    }
  }

  // 普通乗車券の計算
  if (!isIc && (searchType === "normal" || searchType === "ticket")) {
    try {
      const cacheResult = await getOptimalSplitWithCache(from, to);
      if (!cacheResult) return { error: "指定された区間の経路が見つかりませんでした。" };
      return { result: cacheResult.data, serverTime: cacheResult.time };
    } catch (err: unknown) {
      if (err instanceof StationCountLimitExceededError || err instanceof RouteNotFoundError) {
        return { error: err.message };
      }
      return { error: "サーバー内部でエラーが発生しました。" };
    }
  }

  // 定期券（磁気定期 or IC定期）の計算
  if (TEMPORARY_STATIONS.toString().includes(from) || TEMPORARY_STATIONS.toString().includes(to)) {
    return { error: "臨時駅発着の定期券は計算できません。" };
  }

  const monthsMap: Record<string, number> = { pass1: 1, pass3: 3, pass6: 6 };
  const months = monthsMap[searchType] || 1;

  try {
    const apiData = await fetchPassApi(from, to, months, isIc);
    return { result: apiData.result, serverTime: apiData.serverTime };
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: "定期券の計算APIとの通信に失敗しました。" };
  }
}
