import Form from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill } from "react-icons/ri";

export const metadata: Metadata = {
  title: "分割乗車券プログラム",
  description: "発駅と着駅から分割乗車券の最安解を計算します．",
};

export default function Page() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <main className="max-w-xl mx-auto">

        {/* ページヘッダー領域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
            <RiScissorsFill className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
            分割乗車券プログラム
          </h1>
          <p className="text-sm sm:text-base text-slate-600">
            乗車する区間の「発駅」と「着駅」を入力してください。<br className="hidden sm:block" />
            最もお得な分割ルートを計算します。
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