import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "分割定期券の買い方完全ガイド",
  description: "磁気定期券・IC定期券・モバイルSuicaでの分割定期券を実際に購入する方法を手順ごとに解説。他社線を含む場合の購入方法も具体例とともに紹介します。",
  alternates: {
    canonical: "/articles/how-to-buy-split-pass",
  },
};

export default function HowToBuySplitTicketPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '分割定期券の買い方完全ガイド',
    description: '磁気定期券・IC定期券・モバイルSuicaでの分割定期券を実際に購入する方法を手順ごとに解説します。',
    url: 'https://kippu-navi.com/articles/how-to-buy-split-pass',
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
          <span>分割定期券の買い方</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">実践</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"分割定期券の買い方完全ガイド"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年7月18日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入前に知っておくべきこと</h2>
              <p>
                {"分割定期券を購入するにあたって、まず旅客営業規則第20条の「駅において発売する乗車券類は、その駅から有効なものに限って発売する」という原則を理解しておく必要があります。"}
              </p>
              <p className="mt-3">
                {"つまり、自分がいる駅の券売機では「他の駅が発駅となる乗車券」は原則として購入できません。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入方法紹介：磁気定期券</h2>
              <p>
                {"指定席券売機（みどりの券売機）やみどりの窓口（きっぷうりば）では、磁気定期券での分割定期券を購入できます。それぞれの区間の定期券を購入しましょう。"}
              </p>
              <p className="mt-3">
                {"ただし、他駅発着の定期券を購入できない場合は、分割区間の一方の駅まで行って購入する必要があります。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入方法紹介：IC定期券</h2>
              <p>
                {"ICカードでの分割定期券は、現在Suica・Kitaca・ICOCAが対応しており、2区間（1分割）であれば1枚のICカードに記録することができます。ただし、他社線を含めることはできません。"}
              </p>
              <p className="mt-3">
                {"みどりの窓口でIC定期券として購入できます。万が一、旅客営業規則第20条を理由に発売を断られた場合は、それぞれ分割区間の一方の駅で一度磁気定期券として現金で購入し、その後カードに移すという方法もあります。"}
              </p>
              <p className="mt-3">
                {"モバイルSuicaは、スマートフォンで利用できる唯一の分割定期券です。"}
                {"カード式の分割定期券と同様に最大2区間（1分割）までで、他社線を含めることはできません。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">具体例①（JRで完結する場合）</h2>
              <p>
                {"東京↔小山（上野東京ライン）の6ヶ月定期は219,730円です。"}
                {"このとき、途中の南浦和駅で分割すると、66,970円（東京↔南浦和）+150,660円（南浦和↔小山）=217,630円となり、2,100円安くなります。"}
              </p>
              <p className="mt-3">
                {"上野東京ライン（宇都宮線）は南浦和駅にホームが無く通過しますが、経路上の駅であるため問題ありません。"}
              </p>
              <p className="mt-3">
                {"磁気定期券の場合は、みどりの窓口で購入後に改札口で入場記録が無くても出場できるように処理をしてもらいます。"}
              </p>
            </section>

            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">具体例②（他社線を含める場合）</h2>
              <p>
                {"逗子↔［メトロ］地下鉄霞ヶ関（横須賀線・東京・丸ノ内線）の6ヶ月定期は188,360円です。"}
                {"このうち、逗子↔東京（横須賀線）が150,660円、東京↔霞ヶ関（丸ノ内線）が37,700円です。"}
              </p>
              <p className="mt-3">
                {"このとき、JR区間の逗子↔東京を途中の横浜駅で分割すると、66,970円（逗子↔横浜）+79,650円（横浜↔東京）=146,620円となり、4,040円安くなります。"}
              </p>
              <p className="mt-3">
                {"ただし、この場合は分割定期券として1枚のカードにまとめることができません。"}
                {"「逗子↔横浜・横浜↔［メトロ］地下鉄霞ヶ関」なら2区間では？と思うかもしれませんが、他社線を含むため発売されません。"}
              </p>
              <p className="mt-3">
                {"これを解決するには、JR区間はSuica定期券、東京メトロ区間はPASMO定期券で購入するというアプローチが考えられます。"}
                {"改札でどちらのICカードをタッチするかを意識する必要があります。"}
              </p>
              <p className="mt-3">
                {"なお、中野駅のような改札内乗換駅では一度出場と入場が必要になります。また、西船橋駅のような乗換改札がある駅では、2枚のICカードを同時に処理できないため、乗換改札を使わずに改札外へ出る必要があります。"}
                {"乗換駅の状況に応じて、購入する定期券の種類を使い分ける必要があります。"}
              </p>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/how-to-buy-split-ticket" className="text-blue-600 hover:underline">→ 分割乗車券の買い方完全ガイド（えきねっと編）</Link></li>
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/merit-demerit" className="text-blue-600 hover:underline">→ 分割きっぷのメリット・デメリット完全まとめ</Link></li>
            </ul>
          </div>
        </article >
      </div >
    </>
  );
}
