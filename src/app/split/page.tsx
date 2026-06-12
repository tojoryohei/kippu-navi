import Form, { TEMPORARY_STATIONS } from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill, RiErrorWarningLine } from "react-icons/ri";
import { getOptimalSplitWithCache } from "@/app/split/lib/getOptimalSplitWithCache";
import { StationCountLimitExceededError, RouteNotFoundError } from "@/app/utils/errors";
import stationDatas from "@/app/split/data/stationDatas.json";
import { ApiCalculateResponse } from "@/app/types";

export const metadata: Metadata = {
  title: "JR分割乗車券プログラム",
  description: "JR在来線の「発駅」「着駅」から普通乗車券と定期乗車券の分割乗車券の最安解を計算します。",
};

const STATION_NAMES = new Set(stationDatas.map((s) => s.name));

async function fetchPassApi(from: string, to: string, months: number) {
  const start = performance.now();
  const response = await fetch("https://split-pass-api-yvgda2swha-an.a.run.app/api/split-pass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ start: from, end: to, months }),
    cache: "no-store"
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || "サーバー内部でエラーが発生しました。");
  }

  const data: ApiCalculateResponse = await response.json();

  if (!data.results || data.results.length === 0) {
    throw new Error("経路が見つかりませんでした。");
  }

  const normalApiResult = data.normal || data.results[0];
  const normalDeparture = normalApiResult.segments[0].path[0];
  const normalArrival = normalApiResult.segments[normalApiResult.segments.length - 1].path[normalApiResult.segments[normalApiResult.segments.length - 1].path.length - 1];
  const normalVia = normalApiResult.segments.flatMap((s) => s.via);
  const normalTotalEigyoKilo = normalApiResult.segments.reduce((acc, s) => acc + (s.totalEigyoKilo || 0), 0);

  const cheapestKippuData = {
    totalEigyoKilo: normalTotalEigyoKilo,
    departureStation: normalDeparture,
    arrivalStation: normalArrival,
    printedViaLines: normalVia,
    fare: normalApiResult.totalAmount,
    validDays: 0,
  };

  const splitKippuDatasList = [];

  for (const res of data.results) {
    const splitKippuDatas = [];

    for (let i = 0; i < res.segments.length; i++) {
      const seg = res.segments[i];
      const segDeparture = seg.path[0];
      const segArrival = seg.path[seg.path.length - 1];
      const segFare = seg.result.Fare + seg.result.BarrierFreeFee + seg.result.Charge;

      splitKippuDatas.push({
        departureStation: i === 0 ? normalDeparture : segDeparture,
        arrivalStation: i === res.segments.length - 1 ? normalArrival : segArrival,
        kippuData: {
          totalEigyoKilo: seg.totalEigyoKilo || 0,
          departureStation: segDeparture,
          arrivalStation: segArrival,
          printedViaLines: seg.via,
          fare: segFare,
          validDays: 0,
        }
      });
    }

    splitKippuDatasList.push({
      totalFare: res.totalAmount,
      splitKippuDatas: splitKippuDatas
    });
  }

  return {
    result: { cheapestKippuData, splitKippuDatasList },
    serverTime: performance.now() - start
  };
}

async function fetchCalculationData(from: string, to: string, searchType: string) {
  if (from === to) {
    return { error: "出発駅と到着駅が同じです。" };
  }

  if (!STATION_NAMES.has(from) || !STATION_NAMES.has(to)) {
    return { error: "駅名が正しくありません。正しい駅名を選択または入力してください。" };
  }

  // 普通乗車券の計算
  if (searchType === "normal" || searchType === "ticket") {
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

  // 磁気定期券の計算
  if (TEMPORARY_STATIONS.toString().includes(from) || TEMPORARY_STATIONS.toString().includes(to)) {
    return { error: "臨時駅発着の定期券は計算できません。" };
  }

  const monthsMap: Record<string, number> = { pass1: 1, pass3: 3, pass6: 6 };
  const months = monthsMap[searchType] || 1;

  try {
    const apiData = await fetchPassApi(from, to, months);
    return { result: apiData.result, serverTime: apiData.serverTime };
  } catch (err: unknown) {
    if (err instanceof Error) {
      return { error: err.message };
    }
    return { error: "定期券の計算APIとの通信に失敗しました。" };
  }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;
  const searchType = typeof params.searchType === "string" ? params.searchType : "ticket";

  let result = null;
  let error = null;
  let serverTime = null;

  if (from && to) {
    const data = await fetchCalculationData(from, to, searchType);
    result = data.result || null;
    error = data.error || null;
    serverTime = data.serverTime || null;
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <main className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
            <RiScissorsFill className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            JR分割乗車券プログラム
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            乗車する区間の「発駅」と「着駅」、および「券種」を選択してください。<br className="hidden sm:block" />
            JR在来線において最もお得な分割ルートを計算します。
          </p>
        </div>
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <RiErrorWarningLine className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-amber-800 leading-relaxed">
            <span className="font-bold block mb-1">【お知らせ】長距離区間の計算制限について</span>
            <p>
              システム負荷軽減のため、<strong>発着駅間の駅数が100を超える場合</strong>の新規計算を一時的に停止しております。
            </p>
          </div>
        </div>

        <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
          <Form
            initialFrom={from}
            initialTo={to}
            initialSearchType={searchType}
            result={result}
            error={error}
            serverTime={serverTime}
          />
        </div>
      </main>
    </div>
  );
}
