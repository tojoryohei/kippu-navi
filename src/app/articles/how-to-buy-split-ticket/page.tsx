import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分割乗車券の買い方完全ガイド（えきねっと編）",
  description: "えきねっとで分割乗車券を実際に購入する方法を手順ごとに解説。他駅発売の制限や注意点も紹介します。",
  alternates: {
    canonical: "/articles/how-to-buy-split-ticket",
  },
};

export default function HowToBuySplitTicketPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '分割乗車券の買い方完全ガイド（えきねっと編）',
    description: 'えきねっとで分割乗車券を実際に購入する方法を手順ごとに解説。他駅発売の制限や注意点も紹介します。',
    url: 'https://kippu-navi.com/articles/how-to-buy-split-ticket',
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
          <span>分割乗車券の買い方完全ガイド（えきねっと編）</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">実践</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"分割乗車券の買い方完全ガイド"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入前に知っておくべきこと</h2>
              <p>
                {"分割乗車券を購入するにあたって、まず旅客営業規則第20条の「駅において発売する乗車券類は、その駅から有効なものに限って発売する」という原則を理解しておく必要があります。"}
              </p>
              <p className="mt-3">
                {"つまり、自分がいる駅では「他の駅が発駅となる乗車券」は原則として購入できません。"}
              </p>
              <p className="mt-3">
                {"調査した限りでは、JR西日本は特に分割乗車券の発売に消極的な傾向があるようです。また、JR東日本の指定席券売機では不正防止のために、他駅発着となる約500円以下の乗車券に発売制限が掛けられているようです。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入方法紹介：えきねっとを利用する</h2>
              <p>
                {"JR東日本の「えきねっと」を使えば、乗車券の購入もオンラインで完結し、発駅制限を回避して指定席券売機で受け取ることができます。"}
                {"乗車券の受取駅によってはJR西日本の「e5489」やJR九州の「列車予約サービス」も便利です。"}
              </p>
              <p className="mt-3">{"分割した区間ごとに以下の操作を行います。"}</p>
              <ol className="list-decimal list-inside space-y-2 ml-2 mt-3">
                <li><Link href="https://www.eki-net.com" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">{"えきねっと"}</Link>にアクセスする</li>
                <li>「乗車券のみ購入」を選択し、分割する各区間の乗車券を検索する</li>
                <li>経路と運賃を確認してから「きっぷ・座席の種類選択へ進む」を選択する</li>
                <li>「乗車券（紙のきっぷ）を申込む」を選択し、分割する各区間の乗車券を購入する</li>
              </ol>
              <p className="mt-3">
                {"最後に出発駅の指定席券売機で全ての乗車券を発券します。このとき、メールに届く発券用のQRコードを使うとスムーズです。"}
              </p>
              <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                <p className="font-bold text-slate-800">【例】東京駅から横浜駅まで</p>
                <p>
                  {"東京→横浜の通し運賃は530円ですが、東京→蒲田と蒲田→横浜はそれぞれ260円です。"}
                  {"つまり、分割することで合計520円となり10円安くなります。"}
                  <br /><br />
                  {"このとき、東京駅の自動券売機では東京→蒲田の乗車券を購入できますが、蒲田→横浜の乗車券は東京駅では購入できません。"}
                  {"そのため、えきねっとを利用して蒲田→横浜の乗車券を事前に購入し、東京駅の指定席券売機で受け取ります。"}
                </p>
              </div>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/how-to-buy-split-pass" className="text-blue-600 hover:underline">→ 分割定期券の買い方完全ガイド</Link></li>
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/merit-demerit" className="text-blue-600 hover:underline">→ 分割きっぷのメリット・デメリット完全まとめ</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
