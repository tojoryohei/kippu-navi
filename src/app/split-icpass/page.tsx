import Form from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill, RiErrorWarningLine } from "react-icons/ri";

export const metadata: Metadata = {
  title: "JR分割IC定期券プログラム",
  description: "JR在来線の「発駅」「着駅」から分割IC定期券の最安解を計算します。",
};

export default async function SplitIcPassPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;
  // IC定期券のデフォルトは pass1
  const searchType = typeof params.searchType === "string" ? params.searchType : "pass1";

  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <main className="max-w-xl mx-auto">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
            <RiScissorsFill className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            JR分割IC定期券プログラム
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            乗車する区間の「発駅」と「着駅」、および「定期の期間」を選択してください。<br className="hidden sm:block" />
            Kitaca・Suica・ICOCAにおいて最もお得な分割IC定期ルートを計算します。
          </p>
        </div>
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
          <RiErrorWarningLine className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-sm text-amber-800 leading-relaxed">
            <span className="font-bold block mb-1">【お知らせ】長距離区間の計算制限について</span>
            <p>
              システム負荷軽減のため、<strong>発着駅間の駅数が100を超える場合</strong>は計算を制限することがあります。
            </p>
          </div>
        </div>

        <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
          <Form
            initialFrom={from}
            initialTo={to}
            initialSearchType={searchType}
          />
        </div>
      </main>
    </div>
  );
}
