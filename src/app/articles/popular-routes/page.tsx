import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "人気の分割乗車券5選",
  description: "名古屋～大阪など、検索回数が多い分割乗車券を節約額とともにランキング形式でまとめました。あなたも節約ができるか確認してみましょう。",
  alternates: {
    canonical: "/articles/popular-routes",
  },
};

interface RouteExample {
  route: string;
  normalFare: string;
  splitFare: string;
  savings: string;
}

const examples: RouteExample[] = [
  { route: "名古屋 → 京都", normalFare: "2,310円", splitFare: "2,190円", savings: "120円" },
  { route: "名古屋 → 大阪", normalFare: "3,080円", splitFare: "2,770円", savings: "310円" },
  { route: "新千歳空港 → 札幌", normalFare: "1,230円", splitFare: "1,170円", savings: "60円" },
  { route: "大阪 → 敦賀", normalFare: "2,310円", splitFare: "2,130円", savings: "180円" },
  { route: "大阪 → 岐阜", normalFare: "3,080円", splitFare: "2,550円", savings: "530円" }
];

export default function PopularRoutesPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '人気の分割乗車券5選',
    description: '名古屋～大阪など、検索回数が多い分割乗車券を節約額とともにランキング形式でまとめました。',
    url: 'https://kippu-navi.com/articles/popular-routes',
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
          <span>人気の分割乗車券5選</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-purple-100 text-purple-700">実例</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"人気の分割乗車券5選"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">はじめに</h2>
              <p>
                {"検索回数が多い分割乗車券を節約額とともにランキング形式でまとめました。発着駅の順序が逆のものは合算しており、実用的でない組み合わせは省いてあります。「分割きっぷって本当にお得なの？」と疑問をお持ちの方は、まずはご自身の利用区間に近い例を確認してみてください。"}
              </p>
              <p className="mt-3 text-sm text-slate-500">
                {"※運賃は2026年7月時点のものです。最新の運賃は"}
                <Link href="/split" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割乗車券計算機</Link>
                {"で確認してください。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">分割乗車券の検索回数ランキング（トップ５）</h2>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                      <th className="py-3 px-4 font-bold">区間</th>
                      <th className="py-3 px-4 font-bold">通し運賃</th>
                      <th className="py-3 px-4 font-bold">分割運賃</th>
                      <th className="py-3 px-4 font-bold text-blue-600">節約額</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {examples.map((ex, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">{ex.route}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{ex.normalFare}</td>
                        <td className="py-3 px-4 whitespace-nowrap">{ex.splitFare}</td>
                        <td className="py-3 px-4 font-bold text-blue-600 whitespace-nowrap">{ex.savings}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">あなたの区間をチェックしよう</h2>
              <p>
                {"上記はあくまで一例です。あなたの通勤・旅行ルートでも分割きっぷが使えるかもしれません。"}
                <Link href="/split" className="text-blue-600 hover:underline underline-offset-2 mx-1">JR分割乗車券計算機</Link>
                {"に発駅と着駅を入力するだけで、最安の分割パターンを自動計算できます。"}
              </p>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/commuter-pass-savings" className="text-blue-600 hover:underline">→ 通勤定期を分割購入して節約する方法</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
