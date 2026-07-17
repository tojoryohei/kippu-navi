import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JR運賃の仕組み ― なぜ距離が変わると急に値段が上がるのか",
  description: "JRの運賃はどのように計算されるのか。営業キロ・距離帯・キロ単価・特定区間運賃など、JR運賃制度の基本を初心者にもわかりやすく解説します。",
  alternates: {
    canonical: "/articles/jr-fare-system",
  },
};

export default function JrFareSystemPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: 'JR運賃の仕組み ― なぜ距離が変わると急に値段が上がるのか',
    description: 'JRの運賃制度の基本を初心者にもわかりやすく解説します。',
    url: 'https://kippu-navi.com/articles/jr-fare-system',
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
          <span>JR運賃の仕組み</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-blue-100 text-blue-700">基礎知識</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"JR運賃の仕組み ― なぜ距離が変わると急に値段が上がるのか"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">JR運賃の基本：距離制</h2>
              <p>
                {"JRの運賃は「営業キロ」と呼ばれる距離をもとに計算されます。基本的には「遠くまで乗るほど高くなる」仕組みですが、単純な比例ではなく、距離帯ごとに段階的に運賃が決まります。"}
              </p>
              <p className="mt-3">
                {"例えば、1〜3kmまでは150円、4〜6kmまでは190円のように、一定の距離帯ごとに運賃が設定されています。この距離帯の切れ目で運賃が上がるため、1km多く乗っただけで高くなることがあります。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">幹線と地方交通線</h2>
              <p>
                {"JRの路線は「幹線」と「地方交通線」に分類されており、それぞれ異なる運賃表が適用されます。地方交通線は幹線よりもキロ単価が高く設定されています。"}
              </p>
              <p className="mt-3">
                {"幹線と地方交通線をまたがって利用する場合は、地方交通線の営業キロを「運賃計算キロ」に換算して合算し、幹線の運賃表で計算します。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">特定区間運賃とは</h2>
              <p>
                {"私鉄との競合区間には、通常の距離制運賃よりも安い「特定区間運賃」が設定されていることがあります。例えば、JR東日本の横浜〜渋谷間は東急東横線との競争のため、通常より安い特定運賃が適用されます。"}
              </p>
              <p className="mt-3">
                {"分割きっぷでは、この特定区間運賃を独立させて利用することで全体の運賃を下げるテクニックが有効です。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">運賃を正確に知るには</h2>
              <p>
                {"当サイトの"}
                <Link href="/mr" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR運賃計算機</Link>
                {"を使えば、上記の複雑なルールを自動的に適用して正確な運賃を計算できます。分割による節約を検討する場合は"}
                <Link href="/split" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割乗車券計算機</Link>
                {"もご活用ください。"}
              </p>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/logic" className="text-blue-600 hover:underline">→ 計算の仕組み・技術情報（詳細）</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
