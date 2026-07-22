import Form from "@/app/mr/components/Form";
import type { Metadata } from "next";
import { RiGuideLine } from "react-icons/ri";
import Link from "next/link";

export const metadata: Metadata = {
  title: "JR運賃計算機",
  description: "JR全線の運賃と営業キロを正確に計算。経路を入力して、特定区間運賃や大都市近郊区間の最安経路補正にも対応した運賃計算プログラムを無料で公開しています。",
  alternates: {
    canonical: "/mr",
  },
};

export default function MrPage() {

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'JR運賃計算機',
    description: 'JR全線の運賃と営業キロを正確に計算するプログラムです。',
    url: 'https://kippu-navi.com/mr',
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
              {"JR運賃計算機"}
            </h1>

            <div className="text-sm sm:text-base text-slate-600 leading-relaxed mb-5">
              <p>
                {"発着駅および経由路線を入力してください。"}
              </p>
              <p>
                {"きっぷの運賃を計算します。"}
              </p>
            </div>

          </div>

          {/* フォーム領域（カードスタイル） */}
          <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
            <Form />
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
                  {"JR運賃計算機は、JR全線の運賃と営業キロを正確に計算するプログラムです。分割きっぷ計算機の基盤となるエンジンを、そのままお試しいただけます。"}
                </p>
                <p>
                  {"旅客営業規則に基づき、特定区間運賃、大都市近郊区間内の最安経路補正、幹線・地方交通線の運賃表の適用区分などを考慮して計算します。"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li>発着駅と経由路線を指定した<strong>正確な運賃計算</strong></li>
                  <li>運賃計算経路の<strong>営業キロ</strong>の表示</li>
                  <li>特定区間運賃・加算運賃の自動適用</li>
                  <li>大都市近郊区間内完結時の最安経路への補正</li>
                </ul>
                <p className="text-slate-700 leading-relaxed space-y-3 text-sm mt-2 font-semibold">
                  {"今後実装予定の機能"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li>新幹線を経由する場合の経路補正</li>
                  <li>経路補正を考慮した経路重複エラー</li>
                  <li>特殊経由線を考慮した経由印字</li>
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
                  <li><strong>発駅を入力</strong> — 検索ボックスに出発駅を入力し、候補から選択します。</li>
                  <li><strong>着駅を入力</strong> — 同様に到着駅を入力し、候補から選択します。</li>
                  <li><strong>経由路線を追加</strong> — 経由する路線名を追加します。</li>
                  <li><strong>計算ボタンをクリック</strong> — 運賃と営業キロの計算が開始されます。</li>
                </ol>
                <p className="text-slate-500 text-xs mt-2">
                  {"※分割きっぷの最安パターンを計算したい場合は"}
                  <Link href="/split" className="text-blue-600 hover:underline underline-offset-2 mx-1">
                    {"JR分割乗車券計算機"}
                  </Link>
                  {"をご利用ください。"}
                </p>
              </div>
            </section>

            {/* 運賃計算のポイント */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"JR運賃計算の特徴"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <p>
                  {"JRの運賃計算は「営業キロ」に基づく距離制を基本としていますが、いくつかの特殊なルールが適用されます。当ツールはこれらのルールを実装しています。"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li><strong>幹線と地方交通線の区分</strong> — 地方交通線を含む場合は「運賃計算キロ」に換算して計算</li>
                  <li><strong>特定区間運賃</strong> — 私鉄と競合する区間に設定された特別運賃</li>
                  <li><strong>大都市近郊区間</strong> — 区間内完結の場合は最安経路で計算</li>
                  <li><strong>鉄道バリアフリー料金</strong> — 対象区間では運賃に加算</li>
                </ul>
                <p className="text-slate-500 text-xs mt-2">
                  {"※詳しい計算の仕組みは"}
                  <Link href="/logic" className="text-blue-600 hover:underline underline-offset-2 mx-1">
                    {"計算の仕組み・技術情報"}
                  </Link>
                  {"のページをご覧ください。"}
                </p>
              </div>
            </section>

          </div>
        </main>
      </div>
    </>
  );
}
