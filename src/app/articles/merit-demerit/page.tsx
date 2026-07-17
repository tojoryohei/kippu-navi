import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分割きっぷのメリット・デメリット完全まとめ",
  description: "分割きっぷの節約効果だけでなく、払い戻し手数料や運行不能時の取扱いなど、知っておくべきデメリットも整理して解説します。",
  alternates: {
    canonical: "/articles/merit-demerit",
  },
};

export default function MeritDemeritPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '分割きっぷのメリット・デメリット完全まとめ',
    description: '分割きっぷの節約効果と注意すべきデメリットを整理して解説します。',
    url: 'https://kippu-navi.com/articles/merit-demerit',
    author: { '@type': 'Person', name: 'きっぷナビ運営者', url: 'https://kippu-navi.com/about' },
    publisher: { '@type': 'Organization', name: 'きっぷナビ', url: 'https://kippu-navi.com' },
    datePublished: '2025-09-01',
    dateModified: '2026-07-18',
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/articles" className="text-blue-600 hover:underline">記事一覧</Link>
          <span className="mx-2">›</span>
          <span>メリット・デメリット</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-700">基礎知識</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"分割きっぷのメリット・デメリット完全まとめ"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">メリット</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">✅ 運賃が安くなる</h3>
                  <p>
                    {"最大のメリットは運賃の節約です。特に中〜長距離区間や、特定区間運賃が設定されている区間では大きな節約効果が得られます。当サイトのユーザーデータでは、平均して約123円の節約が確認されています。"}
                  </p>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">✅ 合法的な節約方法</h3>
                  <p>
                    {"分割きっぷは旅客営業規則にも想定された合法的な利用方法です。不正乗車とは全く異なり、正当なきっぷの買い方として認められています。"}
                  </p>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">✅ 定期券でも使える</h3>
                  <p>
                    {"通勤定期券やIC定期券でも分割購入が可能です。定期券は継続的に利用するものなので、長期間にわたって節約効果を享受できます。"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">デメリット</h2>
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">⚠️ 払い戻し手数料が増える</h3>
                  <p>
                    {"きっぷの枚数分だけ払い戻し手数料がかかります。3枚に分割した場合は手数料も3倍になるため、払い戻しの可能性がある場合は注意が必要です。"}
                  </p>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">⚠️ 運行不能・遅延時の取扱い</h3>
                  <p>
                    {"列車の運行不能や遅延が発生した場合、分割したきっぷそれぞれに対して取扱いが行われるため、通しのきっぷと異なる対応になる場合があります。"}
                  </p>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">⚠️ 購入の手間がかかる</h3>
                  <p>
                    {"複数枚のきっぷを購入するため、通しで1枚購入するよりも手間がかかります。特に他駅発の乗車券はインターネット予約を利用する必要がある場合があります。"}
                  </p>
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-800 mb-2">⚠️ 出場時に有人改札が必要（乗車券の場合）</h3>
                  <p>
                    {"自動改札機でも数枚であれば通れることがありますが、確実に出場するには有人改札の利用をおすすめします。"}
                  </p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">まとめ</h2>
              <p>
                {"分割きっぷは正当な節約手段ですが、デメリットも存在します。節約額とデメリットを比較して、ご自身の利用状況に合った選択をすることが大切です。まずは"}
                <Link href="/split" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割乗車券計算機</Link>
                {"で節約額を確認してみてください。"}
              </p>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/how-to-buy-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷの買い方完全ガイド</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
