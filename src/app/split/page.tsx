import Form, { TEMPORARY_STATIONS } from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill, RiErrorWarningLine } from "react-icons/ri";
import { getOptimalSplitWithCache } from '@/app/split/lib/getOptimalSplitWithCache';
import { StationCountLimitExceededError, RouteNotFoundError } from '@/app/utils/errors';
import stationDatas from "@/app/split/data/stationDatas.json";

export const metadata: Metadata = {
  title: "分割乗車券プログラム",
  description: "発駅と着駅から分割乗車券の最安解を計算します。",
};

export default async function Page({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const from = typeof params.from === 'string' ? params.from : undefined;
  const to = typeof params.to === 'string' ? params.to : undefined;

  const searchType = typeof params.searchType === 'string' ? params.searchType : 'normal';

  let result = null;
  let error = null;
  let serverTime = null;

  if (from && to) {
    if (from === to) {
      error = "出発駅と到着駅が同じです。";
    } else {
      const stations = new Set(stationDatas.map((s) => s.name));
      if (!stations.has(from) || !stations.has(to)) {
        error = "駅名が正しくありません。正しい駅名を選択または入力してください。";
      } else {
        if (searchType === 'normal') {
          try {
            const cacheResult = await getOptimalSplitWithCache(from, to);
            if (!cacheResult) {
              error = "指定された区間の経路が見つかりませんでした。";
            } else {
              result = cacheResult.data;
              serverTime = cacheResult.time;
            }
          } catch (err: unknown) {
            if (err instanceof StationCountLimitExceededError) {
              error = err.message;
            } else if (err instanceof RouteNotFoundError) {
              error = err.message;
            } else {
              error = "サーバー内部でエラーが発生しました。";
            }
          }
        } else {
          if (TEMPORARY_STATIONS.toString().includes(from) || TEMPORARY_STATIONS.toString().includes(to)) {
            error = "臨時駅発着の定期券は計算できません。";
            result = null;
          } else {
            error = "【ダミー表示】現在、定期券（通勤１・３・６箇月）の分割計算機能は開発中です。入力値は正常に取得できています。";
          }
        }
      }
    }
  }

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <main className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
            <RiScissorsFill className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            分割乗車券プログラム
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            乗車する区間の「発駅」と「着駅」、および「券種」を選択してください。<br className="hidden sm:block" />
            在来線において最もお得な分割ルートを計算します。
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
