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
                    <div className="text-slate-600 leading-relaxed space-y-4">
                        <p>
                            当サイトでは、JR在来線の運賃計算や分割乗車券の最安解を自動探索するプログラムを公開しています。
                        </p>
                        <p>
                            これらのプログラムは大学の卒業研究の一環として開発されたものであり、厳密な最安値の算出を目指していますが、必ずしも正確な出力を保証するものではありません。万が一、実際とは異なる計算結果が表示された場合は<Link href="/contact" className="text-blue-600 font-bold hover:underline decoration-blue-300 underline-offset-2 mx-1">お問い合わせ</Link>よりご連絡いただけますと幸いです。
                        </p>
                        <p className="bg-slate-50 p-4 rounded-lg text-sm text-slate-700">
                            <strong>【予定】</strong><br />
                            ※サーバーの計算処理時間の制約上、分割乗車券の自動探索機能は「直線距離120km以内」の中距離区間に限定して提供しております。
                        </p>
                        <p className="text-red-600 font-medium">
                            また、このサイトの情報や計算結果をもとにきっぷを購入するときは、必ずJRの旅客営業規則等を確認してからご自身の責任においてお買い求めください。
                        </p>
                        <p className="pt-2 border-t border-slate-100 mt-4">
                            ※「なぜ乗車券を分割すると安くなるのか」という仕組みや、当サイトが採用している経路探索アルゴリズムに関する詳細な解説は、
                            <Link href="/logic" className="text-blue-600 font-bold hover:underline decoration-blue-300 underline-offset-2 mx-1">
                                仕組み
                            </Link>
                            のページをご覧ください。
                        </p>
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