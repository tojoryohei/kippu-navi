import Form from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill, RiErrorWarningLine } from "react-icons/ri";
import Link from "next/link";

export const metadata: Metadata = {
  title: "JR分割IC定期券計算機",
  description: "Kitaca・Suica・ICOCAエリアのIC定期券を分割購入した場合の最安パターンを自動計算。1箇月・3箇月・6箇月に対応。発駅と着駅を入力するだけで定期代の節約額がわかります。",
  alternates: {
    canonical: "/split-icpass",
  },
};

export default async function SplitIcPassPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;
  const month = typeof params.month === "string" ? params.month : undefined;
  // デフォルトおよび無効値のフォールバックは 6 ヶ月
  const searchType = (month === "1") ? "pass1" : (month === "3" ? "pass3" : "pass6");

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'JR分割IC定期券計算機',
    description: 'Kitaca・Suica・ICOCAエリアのIC定期券を分割購入した場合の最安パターンを自動計算します。',
    url: 'https://kippu-navi.com/split-icpass',
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
              {"JR分割IC定期券計算機"}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 min-h-20">
              {"乗車する区間の「発駅」と「着駅」、および「定期の期間」を入力してください。"}
              <br className="hidden sm:block" />
              {"Kitaca・Suica・ICOCAエリアにおいて最安となるパターンを自動で導出します。"}
            </p>
          </div>
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <RiErrorWarningLine className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-amber-800 leading-relaxed">
              <span className="font-bold block mb-1">【お知らせ】長距離区間の計算制限について</span>
              <p>
                システム負荷軽減のため、<strong>発着駅間の駅数が100を超える場合</strong>{"は計算を制限することがあります。"}
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
                  {"JR分割IC定期券計算機は、IC定期券（Kitaca・Suica・ICOCA定期券）を途中の駅で分割して購入した場合に、通しで購入するよりも安くなるかどうかを自動計算するツールです。"}
                </p>
                <p>
                  {"IC定期券は磁気定期券と異なり、1枚のICカード上に2区間分の定期券を搭載できるため、自動改札をタッチするだけで利用可能です。ただし、分割は1回（2区間）までに限定されます。"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li><strong>Kitaca・Suica・ICOCAエリア</strong>に対応</li>
                  <li>1箇月・3箇月・6箇月の各期間に対応</li>
                  <li>IC定期券特有の<strong>2区間制限</strong>を考慮した計算</li>
                  <li>分割駅と各区間の定期代を視覚的に表示</li>
                </ul>
              </div>
            </section>

            {/* IC定期券の分割について */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"IC定期券の分割購入について"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <p>
                  {"IC定期券（Suica定期券・ICOCA定期券等）は、1枚のカードに2区間分の定期を搭載できます。これにより、磁気定期券のように複数枚のカードを使い分ける必要がなく、自動改札をタッチするだけで利用できます。"}
                </p>
                <p>
                  {"ただし、IC定期券での分割購入にはいくつかの制約があります。"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li>分割は<strong>1回（2区間）まで</strong></li>
                  <li>他社線を含めた分割IC乗車券は発売されない</li>
                  <li>異なるICカードエリアをまたぐことはできない</li>
                  <li>各ICカードを取り扱う駅の窓口で購入</li>
                </ul>
                <p className="text-slate-500 text-xs mt-2">
                  {"※詳しい購入方法については"}
                  <Link href="/guide" className="text-blue-600 hover:underline underline-offset-2 mx-1">
                    {"使い方ガイド"}
                  </Link>
                  {"をご覧ください。"}
                </p>
              </div>
            </section>

          </div>
        </main>
      </div>
    </>
  );
}
