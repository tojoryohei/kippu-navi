import Link from "next/link";

export const metadata = {
    title: "このサイトについて",
    description: "きっぷナビの開発背景や免責事項、および運営者に関する情報です。",
};

export default function AboutPage() {
    return (
        <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto space-y-8">

            {/* ページヘッダー */}
            <div className="text-center mb-4">
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                    このサイトについて
                </h1>
            </div>

            {/* コンテンツコンテナ（白背景のカード風） */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 space-y-10">

                {/* セクション：開発の背景と免責事項 */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        サイトの目的と免責事項
                    </h2>
                    <div className="text-slate-700 leading-relaxed space-y-4">
                        <p>
                            当サイトでは、運賃計算や分割きっぷの最安解を自動探索するプログラムを公開しています。
                        </p>
                        <p>
                            これらのプログラムは大学の卒業研究の一環として開発されたものです。
                            厳密な最安値の算出を目指していますが、必ずしも正確な出力を保証するものではありません。
                            万が一、実際とは異なる計算結果が表示された場合は
                            <Link href="/contact" className="text-blue-600 font-bold hover:underline underline-offset-2 mx-1">
                                お問い合わせ
                            </Link>
                            よりご連絡いただけますと幸いです。
                        </p>
                        <p className="bg-slate-50 p-4 rounded-lg text-sm text-slate-700">
                            ※現在サーバーの計算処理時間の制約上、分割乗車券の自動探索機能は「運賃計算キロが最短となる経路の駅数が100以下」の中距離区間に限定して提供しております。
                        </p>
                        <p className="font-medium">
                            また、このサイトの情報や計算結果をもとにきっぷを購入するときは、
                            <strong className="text-red-600 underline">必ずJRの旅客営業規則等を確認してからご自身の責任においてお買い求めください。</strong>
                        </p>
                        <p className="pt-2 border-t border-slate-100 mt-4">
                            ※「なぜきっぷを分割すると安くなるのか」という仕組みや、当サイトが採用している経路探索アルゴリズムに関する詳細な解説は、
                            <Link href="/logic" className="text-blue-600 font-bold hover:underline underline-offset-2 mx-1">
                                計算の仕組み・技術情報
                            </Link>
                            のページをご覧ください。
                        </p>
                    </div>
                </section>

                {/* セクション：用語の表記について */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        用語の表記について
                    </h2>
                    <p className="text-slate-700 text-sm mb-4 leading-relaxed">
                        当サイトでは、分かりやすさを重視するため、旅客営業規則での正式名称と異なる表記を使用している箇所があります。
                    </p>
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                                    <th className="py-3 px-4 font-bold">旅客営業規則上の正式名称</th>
                                    <th className="py-3 px-4 font-bold">きっぷナビでの表記</th>
                                    <th className="py-3 px-4 font-bold">対象となる主なもの</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 text-slate-700">
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-900">乗車券</td>
                                    <td className="py-3 px-4 text-blue-600 font-semibold">きっぷ</td>
                                    <td className="py-3 px-4">普通乗車券や定期乗車券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-900">普通乗車券</td>
                                    <td className="py-3 px-4 text-blue-600 font-semibold">乗車券</td>
                                    <td className="py-3 px-4">1回限りの片道乗車券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-900">通勤定期乗車券</td>
                                    <td className="py-3 px-4 text-blue-600 font-semibold">定期券</td>
                                    <td className="py-3 px-4">通勤用の磁気定期券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-900"></td>
                                    <td className="py-3 px-4 text-blue-600 font-semibold">IC定期券</td>
                                    <td className="py-3 px-4">SuicaやPASMOなどのICカードに搭載された通勤用の定期券</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* セクション：運営者情報 */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        運営者情報
                    </h2>
                    <ul className="text-slate-600 leading-relaxed space-y-3">
                        <li className="flex items-center">
                            <span className="w-28 font-medium text-slate-500">運営者</span>
                            <span className="font-medium text-slate-800">情報工学専攻の大学院1年生</span>
                        </li>
                        <li className="flex items-center">
                            <span className="w-28 font-medium text-slate-500">運営開始日</span>
                            <span className="font-medium text-slate-800">2025年9月</span>
                        </li>
                    </ul>
                </section>

            </div>
        </div>
    );
}
