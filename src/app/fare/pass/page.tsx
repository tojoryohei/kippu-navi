import Form from "@/app/fare/components/Form";
import FormWithSearchParams from "@/app/fare/components/FormWithSearchParams";
import type { Metadata } from "next";
import { RiGuideLine } from "react-icons/ri";
import Link from "next/link";
import { Suspense } from "react";

export const metadata: Metadata = {
  title: "JR定期券運賃計算機",
  description: "JR全線の定期券の運賃を正確に計算。1ヶ月・3ヶ月・6ヶ月の定期代を、特定区間運賃や経路補正に対応して計算します。",
  alternates: {
    canonical: "/fare/pass",
  },
};

export default function FarePassPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'JR定期券運賃計算機',
    description: 'JR全線の定期券運賃を正確に計算するプログラムです。',
    url: 'https://kippu-navi.com/fare/pass',
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

          {/* ページヘッダー領域 */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-4 bg-slate-100 rounded-full mb-4 shadow-sm">
              <RiGuideLine className="w-8 h-8 text-slate-700" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {"JR定期券運賃計算機"}
            </h1>

            <div className="text-sm sm:text-base text-slate-600 leading-relaxed mb-5">
              <p>
                {"発着駅および経由路線を入力してください。"}
              </p>
              <p>
                {"定期券の運賃を計算します。"}
              </p>
            </div>

          </div>

          {/* フォーム領域（カードスタイル） */}
          <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
            <Suspense fallback={<div className="pointer-events-none opacity-50"><Form /></div>}>
              <FormWithSearchParams />
            </Suspense>
          </div>

          {/* ツール説明セクション */}
          <div className="mt-12 space-y-8">

            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"このツールでできること"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <p>
                  {"JR定期券運賃計算機は、JR全線の運賃と営業キロを正確に計算するプログラムです。分割定期券計算機の基盤となるエンジンを、そのままお試しいただけます。"}
                </p>
                <p>
                  {"通勤定期券（1ヶ月・3ヶ月・6ヶ月）の運賃を計算できます。"}
                </p>
                <p>
                  {"旅客営業規則に基づき、特定区間運賃、特定経路区間の補正、幹線・地方交通線の運賃表の適用区分などを考慮して計算します。"}
                </p>
              </div>
            </section>

            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"使い方"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li><strong>発駅を入力</strong> — 検索ボックスに出発駅を入力し、候補から選択します。</li>
                  <li><strong>着駅を入力</strong> — 同様に到着駅を入力し、候補から選択します。</li>
                  <li><strong>経由路線を追加</strong> — 経由する路線名を追加します。</li>
                  <li><strong>計算ボタンをクリック</strong> — 定期券運賃の計算が開始されます。</li>
                </ol>
                <p className="text-slate-500 text-xs mt-2">
                  {"※分割定期券の最安パターンを計算したい場合は"}
                  <Link href="/split/pass" className="text-blue-600 hover:underline underline-offset-2 mx-1">
                    {"JR分割定期券計算機"}
                  </Link>
                  {"をご利用ください。"}
                </p>
              </div>
            </section>

          </div>
        </main>
      </div>
    </>
  );
}
