import Form from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill, RiErrorWarningLine } from "react-icons/ri";
import Link from "next/link";

export const metadata: Metadata = {
  title: "JR分割定期券計算機",
  description: "JR在来線の通勤定期券を分割購入した場合の最安パターンを自動計算。1箇月・3箇月・6箇月に対応。発駅と着駅を入力するだけで、定期代の節約額がわかります。",
  alternates: {
    canonical: "/split-pass",
  },
};

export default async function SplitPassPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;
  const month = typeof params.month === "string" ? params.month : undefined;
  // デフォルトおよび無効値のフォールバックは 6 ヶ月
  const searchType = (month === "1") ? "pass1" : (month === "3" ? "pass3" : "pass6");

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'JR分割定期券計算機',
    description: 'JR在来線の通勤定期券を分割購入した場合の最安パターンを自動計算します。',
    url: 'https://kippu-navi.com/split-pass',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
    },
    author: {
      '@type': 'Person',
      name: 'きっぷナビ運営者',
      url: 'https://kippu-navi.com/about',
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
              <RiScissorsFill className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {"JR分割定期券計算機"}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 min-h-20">
              {"乗車する区間の「発駅」と「着駅」、および「定期の期間」を入力してください。"}
              <br className="hidden sm:block" />
              {"JRの在来線において最もお得な分割ルートを計算します。"}
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

          {/* ツール説明セクション */}
          <div className="mt-12 space-y-8">

            {/* このツールでできること */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"このツールでできること"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <p>
                  {"JR分割定期券計算機は、JR在来線の通勤定期券を途中の駅で分割して購入した場合に、通しで購入するよりも安くなるかどうかを自動計算するツールです。"}
                </p>
                <p>
                  {"1箇月・3箇月・6箇月の定期券に対応しており、期間が長いほど分割の効果が大きくなる傾向があります。毎月の通勤費を見直したい方におすすめです。"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li>通し購入と分割購入の<strong>定期代を比較</strong>し、節約額を表示</li>
                  <li>1箇月・3箇月・6箇月の各期間に対応</li>
                  <li>分割駅と各区間の定期代を視覚的に表示</li>
                  <li>磁気定期券での分割購入を前提とした計算</li>
                </ul>
              </div>
            </section>

            {/* 使い方 */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"使い方"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li><strong>発駅を入力</strong> — 検索ボックスに通勤の出発駅を入力し、候補から選択します。</li>
                  <li><strong>着駅を入力</strong> — 同様に通勤の到着駅を入力し、候補から選択します。</li>
                  <li><strong>定期の期間を選択</strong> — 1箇月・3箇月・6箇月から選びます。</li>
                  <li><strong>計算ボタンをクリック</strong> — 最安分割パターンの計算が開始されます。</li>
                </ol>
                <p className="text-slate-500 text-xs mt-2">
                  {"※定期券の購入方法や利用方法については"}
                  <Link href="/guide" className="text-blue-600 hover:underline underline-offset-2 mx-1">
                    {"使い方ガイド"}
                  </Link>
                  {"をご覧ください。"}
                </p>
              </div>
            </section>

            {/* 定期券の分割購入について */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"定期券の分割購入について"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <p>
                  {"通勤定期券は毎月の出費が大きいため、分割購入による節約効果は乗車券以上に大きくなります。特に6箇月定期の場合、年間で数千円〜数万円の節約になるケースもあります。"}
                </p>
                <p>
                  {"磁気定期券で分割購入する場合は、駅の券売機やみどりの窓口（きっぷうりば）で購入できます。購入後は有人改札で「入場記録が無くても出場できる設定」をしてもらう場合があります。"}
                </p>
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-amber-800 text-xs mt-2">
                  <p className="font-bold mb-1">ご注意</p>
                  <p>通学定期券およびオフピーク定期券は分割して購入することができません。</p>
                </div>
              </div>
            </section>

          </div>
        </main>
      </div>
    </>
  );
}
