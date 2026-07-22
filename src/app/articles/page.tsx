import Link from "next/link";
import type { Metadata } from "next";
import { RiArticleLine, RiArrowRightSLine } from "react-icons/ri";

export const metadata: Metadata = {
  title: "解説記事",
  description: "JRの分割きっぷに関する解説記事や、運賃制度の仕組み、節約テクニックなど、鉄道利用に役立つ情報を発信しています。",
  alternates: {
    canonical: "/articles",
  },
};

interface ArticleCard {
  href: string;
  title: string;
  description: string;
  tag: string;
  tagColor: string;
}

const articles: ArticleCard[] = [
  {
    href: "/articles/what-is-split-ticket",
    title: "分割きっぷとは？仕組みをわかりやすく解説",
    description: "JRのきっぷを途中駅で分割して購入すると、なぜ安くなるのか。その仕組みと基本的な考え方を初心者向けに解説します。",
    tag: "基礎知識",
    tagColor: "bg-blue-100 text-blue-700",
  },
  {
    href: "/articles/how-to-buy-split-ticket",
    title: "分割乗車券の買い方完全ガイド（えきねっと編）",
    description: "えきねっとで分割乗車券を実際に購入する方法を手順ごとに解説します。",
    tag: "実践",
    tagColor: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/articles/how-to-buy-split-pass",
    title: "分割定期券の買い方完全ガイド",
    description: "磁気定期券・IC定期券・モバイルSuicaでの分割定期券を実際に購入する方法を手順ごとに解説します。",
    tag: "実践",
    tagColor: "bg-emerald-100 text-emerald-700",
  },
  {
    href: "/articles/commuter-pass-savings",
    title: "通勤定期を分割購入して年間○万円節約する方法",
    description: "毎月の通勤定期代を見直すだけで大きな節約に。定期券の分割購入で年間いくら安くなるか、具体例とともに解説します。",
    tag: "節約術",
    tagColor: "bg-amber-100 text-amber-700",
  },
  {
    href: "/articles/jr-fare-system",
    title: "JR運賃の仕組み ― なぜ距離が変わると急に値段が上がるのか",
    description: "JRの運賃はどのように決まるのか。距離帯・特定区間運賃など、運賃制度の基本を解説します。",
    tag: "基礎知識",
    tagColor: "bg-blue-100 text-blue-700",
  },
  {
    href: "/articles/merit-demerit",
    title: "分割きっぷのメリット・デメリット完全まとめ",
    description: "分割きっぷには節約効果だけでなく注意点もあります。メリットとデメリットを整理して解説します。",
    tag: "基礎知識",
    tagColor: "bg-blue-100 text-blue-700",
  },
  {
    href: "/articles/popular-routes",
    title: "人気の分割きっぷ例5選",
    description: "名古屋～大阪など、検索回数が多い区間の分割きっぷの具体例と節約額をまとめました。",
    tag: "実例",
    tagColor: "bg-purple-100 text-purple-700",
  },
];

export default function ArticlesPage() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">

      {/* ページヘッダー */}
      <header className="text-center mb-8">
        <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
          <RiArticleLine className="w-8 h-8 text-blue-600" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          {"解説記事"}
        </h1>
        <p className="mt-4 text-slate-500 max-w-2xl mx-auto">
          {"JRの分割きっぷに関する解説記事や、運賃制度の仕組み、節約テクニックなど、鉄道利用に役立つ情報を発信しています。"}
        </p>
      </header>

      {/* 記事カードグリッド */}
      <div className="grid gap-6 sm:grid-cols-2">
        {articles.map((article) => (
          <Link
            key={article.href}
            href={article.href}
            className="group bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-400 transition-all duration-300 flex flex-col"
          >
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${article.tagColor}`}>
                {article.tag}
              </span>
            </div>
            <h2 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors duration-300 mb-2">
              {article.title}
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed grow">
              {article.description}
            </p>
            <div className="text-blue-600 font-bold text-sm flex items-center mt-4 group-hover:translate-x-1 transition-transform duration-300">
              {"記事を読む"}
              <RiArrowRightSLine className="w-5 h-5 ml-1" />
            </div>
          </Link>
        ))}
      </div>

    </div>
  );
}
