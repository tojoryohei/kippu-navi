import Form from "@/app/mr/components/Form";
import type { Metadata } from "next";
import { RiGuideLine } from "react-icons/ri";

export const metadata: Metadata = {
  title: "JR運賃計算プログラム",
  description: "経路を入力してJRの運賃を計算するためのページです。",
};

export default function Page() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <main className="max-w-xl mx-auto">

        {/* ページヘッダー領域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-slate-100 rounded-full mb-4 shadow-sm">
            <RiGuideLine className="w-8 h-8 text-slate-700" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            JR運賃計算プログラム
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed mb-5">
            JR在来線の「発駅」「着駅」、および経由を入力してください。<br className="hidden sm:block" />
            片道乗車券の運賃を計算します。
          </p>

          {/* 仕様・制限事項の枠組み */}
          <div className="inline-block text-left bg-slate-50 border border-slate-200 rounded-lg p-4 max-w-xl mx-auto">
            <p className="font-semibold text-xs sm:text-sm text-slate-600 mb-2">
              【現在の仕様・制限事項】
            </p>
            <ul className="text-xs sm:text-sm text-slate-500 list-disc list-inside space-y-1">
              <li>このプログラムで計算できる経由路線数の上限は99です。</li>
              <li>経路の重複による運賃計算の制限は行っていません。</li>
              <li>大都市近郊区間内完結の場合の「最安」は外方に経路を伸ばしません。</li>
              <li>出力される経由は実際の経由印字と異なることがあります。</li>
              <li>新幹線を経由する場合の運賃計算は現在開発中の機能です。</li>
            </ul>
          </div>
        </div>

        {/* フォーム領域（カードスタイル） */}
        <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
          <Form />
        </div>

      </main>
    </div>
  );
}
