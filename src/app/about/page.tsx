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
                    {"このサイトについて"}
                </h1>
            </div>

            {/* コンテンツコンテナ（白背景のカード風） */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 space-y-10">

                {/* セクション：サイトの目的 */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        {"サイトの目的"}
                    </h2>
                    <div className="text-slate-700 leading-relaxed space-y-4">
                        <p>
                            {"当サイトでは、運賃計算や分割きっぷの最安解を自動探索するプログラムを公開しています。"}
                        </p>
                        <p>
                            {"これらのプログラムは大学の卒業研究の一環として開発されたものです。"}
                            {"厳密な最安値の算出を目指していますが、必ずしも正確な出力を保証するものではありません。"}
                            {"万が一、実際とは異なる計算結果が表示された場合は"}
                            <Link href="/contact" className="text-blue-600 font-bold hover:underline underline-offset-2 mx-1">
                                {"お問い合わせ"}
                            </Link>
                            {"よりご連絡いただけますと幸いです。"}
                        </p>
                        <p className="bg-slate-50 p-4 rounded-lg text-sm text-slate-700">
                            {"現在、サーバーの計算処理時間の制約上、分割乗車券の自動探索機能は「運賃計算キロが最短となる経路の駅数が100以下」の中距離区間に限定して提供しております。"}
                        </p>
                        <p className="pt-2 border-t border-slate-100 mt-4">
                            {"※「なぜきっぷを分割すると安くなるのか」という仕組みや、当サイトが採用している経路探索アルゴリズムに関する詳細な解説は、"}
                            <Link href="/logic" className="text-blue-600 font-bold hover:underline underline-offset-2 mx-1">
                                {"計算の仕組み・技術情報"}
                            </Link>
                            {"のページをご覧ください。"}
                        </p>
                    </div>
                </section>

                {/* セクション：用語の表記について */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        {"用語の表記について"}
                    </h2>
                    <p className="text-slate-700 text-sm mb-4 leading-relaxed">
                        {"当サイトでは、分かりやすさを重視するため、旅客営業規則での正式名称と異なる表記を使用しております。"}
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
                            <tbody className="divide-y divide-slate-100">
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-800">乗車券</td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">きっぷ</td>
                                    <td className="py-3 px-4">普通乗車券や定期乗車券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-800">普通乗車券</td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">乗車券</td>
                                    <td className="py-3 px-4">1回限りの片道乗車券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-800">通勤定期乗車券</td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">定期券</td>
                                    <td className="py-3 px-4">通勤用の磁気定期券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-800"></td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">IC定期券</td>
                                    <td className="py-3 px-4">SuicaやPASMOなどのICカードに搭載された通勤用の定期券</td>
                                </tr>
                                <tr className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-3 px-4 font-medium text-slate-800">旅客運賃、鉄道バリアフリー料金</td>
                                    <td className="py-3 px-4 font-semibold text-slate-900">運賃</td>
                                    <td className="py-3 px-4">発売額（※博多南駅を発着とする定期券は博多南線の特急料金を含みます）</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </section>

                {/* セクション：免責事項 */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        {"免責事項"}
                    </h2>
                    <div className="text-slate-800 leading-relaxed">
                        <ul className="list-disc list-outside pl-5 space-y-4">
                            <li className="font-medium">
                                {"このサイトの情報や計算結果をもとにきっぷを購入するときは、旅客営業規則等を確認して"}
                                <strong className="text-red-500 underline">{"必ずご自身の責任で購入・ご利用ください。"}</strong>
                            </li>
                            <li className="font-medium">
                                {"きっぷを購入したとき、鉄道事業者と旅客の間で運送等の契約が成立します。"}
                                {"運送等の契約は、分割したそれぞれのきっぷで交わされます。"}
                                {"当サイトではプログラムによる計算結果の情報提供のみを行っており、上記契約には一切関与いたしません。"}
                                {"当サイトの計算結果によって生じた損害やトラブル等について、"}
                                <strong className="text-red-500 underline">{"当サイトの運営者は一切の責任を負いません。"}</strong>
                            </li>
                        </ul>
                    </div>
                </section>

                {/* セクション：運営者情報 */}
                <section>
                    <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
                        {"運営者情報"}
                    </h2>
                    <ul className="text-slate-600 leading-relaxed space-y-3">
                        <li className="flex items-center">
                            <span className="w-28 font-medium text-slate-500">運営者</span>
                            <span className="font-medium text-slate-800">とある大学院生（情報工学専攻）</span>
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
