import Form from "@/app/mr/components/Form";
import type { Metadata } from "next";
import { RiGuideLine } from "react-icons/ri";

export const metadata: Metadata = {
  title: "運賃計算（経路入力）",
  description: "乗車券の基本運賃を計算するための経路入力ページです。",
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
            運賃計算（経路入力）
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            在来線の「発駅」「着駅」、および経由を入力してください。<br className="hidden sm:block" />
            片道乗車券の運賃を計算します。
            経路重複による運賃計算の制限は行っていません。
          </p>
        </div>

        {/* フォーム領域（カードスタイル） */}
        <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
          <Form />
        </div>

      </main>
    </div>
  );
}