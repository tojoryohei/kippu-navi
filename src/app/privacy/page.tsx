import Link from "next/link";

export const metadata = {
    title: "プライバシーポリシー",
    description: "きっぷナビのプライバシーポリシー、アクセス解析ツールおよび広告配信に関する方針を掲載しています。",
};

export default function PrivacyPage() {
    return (
        <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">

            {/* ページヘッダー */}
            <div className="text-center space-y-4 mb-10">
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                    プライバシーポリシー
                </h1>
            </div>

            {/* コンテンツエリア（白背景のカード風） */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 space-y-10 text-slate-700 leading-loose">

                <section>
                    <h2 className="text-xl font-bold text-slate-900 border-b pb-2 mb-4">
                        アクセス解析ツールについて
                    </h2>
                    <p>
                        当サイトでは，Googleによるアクセス解析ツール「Google Analytics」を利用しています．
                        このGoogle Analyticsはトラフィックデータの収集のためにCookieを使用しています．トラフィックデータは匿名で収集されており，個人を特定するものではありません．
                    </p>
                    <p className="mt-4">
                        この機能はCookieを無効にすることで収集を拒否することが出来ますので，お使いのブラウザの設定をご確認ください．
                        <br />
                        Google Analyticsの利用規約や，Googleによるデータ使用の仕組みについては，以下のリンクからご確認いただけます．
                    </p>
                    <ul className="mt-4 space-y-2 list-disc list-inside ml-2">
                        <li>
                            <Link
                                href="https://marketingplatform.google.com/about/analytics/terms/jp/"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline underline-offset-2"
                            >
                                Google Analytics利用規約
                            </Link>
                        </li>
                        <li>
                            <Link
                                href="https://policies.google.com/technologies/partner-sites?hl=ja"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 hover:underline underline-offset-2"
                            >
                                Googleのサービスを使用するサイトやアプリから収集した情報のGoogleによる使用
                            </Link>
                        </li>
                    </ul>
                </section>

                <section>
                    <h2 className="text-xl font-bold text-slate-900 border-b pb-2 mb-4">
                        広告の配信について
                    </h2>
                    <p>
                        当サイトでは，第三者配信の広告サービス（Google AdSense）を利用しています．
                        広告配信事業者は，ユーザーの興味に応じた広告を表示するためにCookieを使用することがあります．
                    </p>
                    <p className="mt-4">
                        Googleによる広告におけるCookieの取り扱いについては，
                        <Link
                            href="https://policies.google.com/technologies/ads?hl=ja"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline underline-offset-2 mx-1"
                        >
                            Googleのポリシーと規約ページ
                        </Link>
                        をご参照ください．
                    </p>
                </section>

            </div>
        </div>
    );
}