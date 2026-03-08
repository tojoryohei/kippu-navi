import Link from 'next/link';
import { RiScissorsFill, RiGuideLine } from "react-icons/ri";

export const metadata = {
  title: "きっぷナビ - 最適な分割乗車券をご案内",
  description: "発駅と着駅から最適な分割乗車券を計算するプログラムです。",
};

export default function Home() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* ヒーローセクション */}
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            きっぷナビへようこそ
          </h1>
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed">
            発駅と着駅を指定するだけで、最もお得な分割乗車券の組み合わせを瞬時に計算します。
            また、開発の基盤となっている運賃計算プログラムもお試しいただけます。
          </p>
          {/* 追加：アップデートお知らせバッジ */}
          <div className="inline-flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            2026/03/14のJR東日本運賃改定に対応しました。
          </div>
        </div>

        {/* リンクカードセクション */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* 分割運賃プログラム（メイン） */}
          <Link
            href="/split"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-500 transition-all duration-300 flex flex-col h-full"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-blue-100 p-3 rounded-xl group-hover:bg-blue-600 transition-colors duration-300">
                <RiScissorsFill className="w-7 h-7 text-blue-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors duration-300">
                分割運賃プログラム
              </h2>
            </div>
            <p className="text-slate-600 mb-6 grow">
              一番お得な分割ルートを検索します。実際の旅行や交通費の節約に活用したい方はこちらをご利用ください。
            </p>
            <div className="text-blue-600 font-bold flex items-center group-hover:translate-x-2 transition-transform duration-300">
              計算してみる
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </Link>

          {/* 運賃計算プログラム（サブ） */}
          <Link
            href="/mr"
            className="group bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-400 transition-all duration-300 flex flex-col h-full"
          >
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-slate-100 p-3 rounded-xl group-hover:bg-slate-700 transition-colors duration-300">
                <RiGuideLine className="w-7 h-7 text-slate-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">
                運賃計算プログラム
              </h2>
            </div>
            <p className="text-slate-600 mb-6 grow">
              分割計算の基礎となる、乗車券の普通運賃を計算します。運賃の仕組みを知りたい方はこちら。
            </p>
            <div className="text-slate-700 font-bold flex items-center group-hover:translate-x-2 transition-transform duration-300">
              運賃を確認する
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </div>
          </Link>

        </div>
      </div>
    </div>
  );
}