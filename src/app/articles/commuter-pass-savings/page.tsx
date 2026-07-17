import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "通勤定期を分割購入して年間数万円節約する方法",
  description: "JRの通勤定期券を分割購入するだけで年間数千円〜数万円の節約が可能。具体的な節約額の計算例や、分割定期券の購入手順を解説します。",
  alternates: {
    canonical: "/articles/commuter-pass-savings",
  },
};

export default function CommuterPassSavingsPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '通勤定期を分割購入して年間数万円節約する方法',
    description: 'JRの通勤定期券を分割購入するだけで年間数千円〜数万円の節約が可能です。',
    url: 'https://kippu-navi.com/articles/commuter-pass-savings',
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
          <span>通勤定期の節約法</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-amber-100 text-amber-700">節約術</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"通勤定期を分割購入して年間数万円節約する方法"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">なぜ定期券の分割がお得なのか</h2>
              <p>
                {"通勤定期券は毎月の固定費として大きな割合を占めます。乗車券と同様に、定期券も途中の駅で分割して購入すると安くなるケースがあります。特に6箇月定期の場合、分割による割引額が大きくなる傾向があります。"}
              </p>
              <p className="mt-3">
                {"従業員の交通費を支出する会社からしても、1人あたりの節約額が年間1,000円だとしたら、従業員数次第で大きな節約につながります。定期券の見直しをするだけで得られる金額としては決して小さくありません。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">分割定期券のシミュレーション方法</h2>
              <p>
                {"当サイトの"}
                <Link href="/split-pass" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割定期券計算機</Link>
                {"を使えば、発駅と着駅を入力するだけで最安の分割パターンを自動計算できます。1箇月・3箇月・6箇月の各期間に対応しています。"}
              </p>
              <p className="mt-3">
                {"IC定期券で分割したい場合は"}
                <Link href="/split-icpass" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割IC定期券計算機</Link>
                {"をご利用ください。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">会社への申請について</h2>
              <p>
                {"通勤定期代は会社から支給される場合がほとんどですが、分割定期券の利用を会社に申告する必要があるかどうかは各社の就業規則によります。トラブルを避けるためにも、事前に確認することをおすすめします。"}
              </p>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/popular-routes" className="text-blue-600 hover:underline">→ 人気の分割きっぷ例5選</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
