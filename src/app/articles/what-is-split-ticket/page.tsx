import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分割きっぷとは？仕組みをわかりやすく解説",
  description: "JRのきっぷを途中駅で分割して購入すると安くなる「分割きっぷ」の仕組みを初心者向けにわかりやすく解説。なぜ安くなるのか、基本的な考え方から具体例まで紹介します。",
  alternates: {
    canonical: "/articles/what-is-split-ticket",
  },
};

export default function WhatIsSplitTicketPage() {

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '分割きっぷとは？仕組みをわかりやすく解説',
    description: 'JRのきっぷを途中駅で分割して購入すると安くなる「分割きっぷ」の仕組みを初心者向けにわかりやすく解説します。',
    url: 'https://kippu-navi.com/articles/what-is-split-ticket',
    author: {
      '@type': 'Person',
      name: 'きっぷナビ運営者',
      url: 'https://kippu-navi.com/about',
    },
    publisher: {
      '@type': 'Organization',
      name: 'きっぷナビ',
      url: 'https://kippu-navi.com',
    },
    datePublished: '2025-09-01',
    dateModified: '2026-07-18',
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">

        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/articles" className="text-blue-600 hover:underline">記事一覧</Link>
          <span className="mx-2">›</span>
          <span>分割きっぷとは？</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-700">基礎知識</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"分割きっぷとは？仕組みをわかりやすく解説"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">分割きっぷとは</h2>
              <p>
                {"分割きっぷとは、JRの乗車券を途中の駅で区切って購入することで、通しで購入するよりも合計運賃が安くなる乗車券の買い方のことです。正式な名称ではなく、一般的に広く使われている通称です。"}
              </p>
              <p className="mt-3">
                {"例えば、東京駅から横浜駅までの乗車券は530円ですが、途中の蒲田駅で分割して「東京→蒲田（260円）」と「蒲田→横浜（260円）」の2枚を購入すると合計520円となり、10円安くなります。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">なぜ分割すると安くなるのか</h2>
              <p>
                {"JRの運賃制度には、分割した方が安くなるいくつかの構造的な要因があります。"}
              </p>
              <ul className="list-disc list-outside ml-5 mt-3 space-y-2">
                <li><strong>キロ単価の変動</strong> — 運賃のキロ単価は距離帯によって変動するため、分割した方が安価な帯に収まる場合がある</li>
                <li><strong>特定区間運賃</strong> — 私鉄と競合する区間には通常よりも安い特別運賃が設定されており、その区間を独立させると安くなる</li>
                <li><strong>距離帯間隔の拡大</strong> — 長距離になるほど運賃が跳ね上がる間隔が広がるため、短距離の乗車券を分けて購入した方が有利になる</li>
                <li><strong>地方交通線の運賃</strong> — JR線には幹線と地方交通線があり、同じ営業キロでの地方交通線の運賃は幹線の運賃のおおよそ1.1倍となるように設定されていますが、11～15kmでは幹線と地方交通線の運賃が同じです</li>
              </ul>
              <p className="mt-3">
                {"詳しい技術的な背景は"}
                <Link href="/logic" className="text-blue-600 hover:underline underline-offset-2 mx-1">計算の仕組み・技術情報</Link>
                {"ページで解説しています。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">分割きっぷの合法性</h2>
              <p>
                {"分割きっぷは完全に合法です。旅客営業規則第157条には2枚以上のきっぷを併用して使用することが想定された条文が存在しており、JRも公式に認めている利用方法です。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">分割きっぷの探し方</h2>
              <p>
                {"最も安くなる分割パターンを手動で見つけるのは非常に困難です。当サイトの"}
                <Link href="/split" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割乗車券計算機</Link>
                {"を使えば、発駅と着駅を入力するだけで最安の分割パターンを自動的に計算できます。"}
              </p>
            </section>

          </div>

          {/* 関連記事 */}
          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/articles/how-to-buy-split-ticket" className="text-blue-600 hover:underline">
                  → 分割きっぷの買い方完全ガイド
                </Link>
              </li>
              <li>
                <Link href="/articles/merit-demerit" className="text-blue-600 hover:underline">
                  → 分割きっぷのメリット・デメリット完全まとめ
                </Link>
              </li>
              <li>
                <Link href="/articles/jr-fare-system" className="text-blue-600 hover:underline">
                  → JR運賃の仕組み
                </Link>
              </li>
            </ul>
          </div>
        </article>

      </div>
    </>
  );
}
