import Link from "next/link";
import { ReactNode } from "react";

export const metadata = {
    title: "はじめての方へ（使い方ガイド）",
    description: "きっぷナビの使い方、駅の券売機やみどりの窓口（きっぷうりば）での分割きっぷの買い方、よくある質問について解説します。",
};

// 汎用アコーディオン項目
interface AccordionItemProps {
    title: string;
    children: ReactNode;
}

function AccordionItem({ title, children }: AccordionItemProps) {
    return (
        <details className="group border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <summary className="flex justify-between items-center font-bold cursor-pointer list-none text-slate-800">
                <span>{title}</span>
                <span className="transition-transform duration-200 group-open:rotate-180 text-slate-500">
                    <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" className="w-5 h-5"><path d="M19 9l-7 7-7-7"></path></svg>
                </span>
            </summary>
            <div className="text-slate-800 mt-3 text-sm leading-relaxed border-t border-slate-100 pt-3 space-y-2">
                {children}
            </div>
        </details>
    );
}

// FAQ専用アコーディオン項目
interface FaqItemProps {
    question: string;
    children: ReactNode;
}

function FaqItem({ question, children }: FaqItemProps) {
    return (
        <details className="group border border-slate-200 rounded-xl p-4 bg-slate-50/50">
            <summary className="flex justify-between items-center font-bold cursor-pointer list-none text-slate-800">
                <h3 className="flex items-center text-base m-0">
                    <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                    {question}
                </h3>
                <span className="transition-transform duration-200 group-open:rotate-180 text-slate-500 p-1">
                    <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" className="w-5 h-5"><path d="M19 9l-7 7-7-7"></path></svg>
                </span>
            </summary>
            <div className="text-slate-700 mt-3 text-sm leading-relaxed border-t border-slate-100 pt-3">
                <div className="mt-1 flex items-start">
                    <span className="shrink-0 bg-slate-200 text-slate-800 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                    <div className="w-full space-y-2">
                        {children}
                    </div>
                </div>
            </div>
        </details>
    );
}

export default function GuidePage() {
    return (
        <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
            {/* ページヘッダー */}
            <header className="text-center mb-8">
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl space-y-2">
                    <p>はじめての方へ</p>
                    <p>（使い方ガイド）</p>
                </h1>
                <p className="mt-8 text-slate-500">
                    <Link href="/split" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                        分割きっぷ計算機
                    </Link>
                    の操作方法から、購入手順や利用方法まで分かりやすく解説します。
                </p>
            </header>

            {/* 目次 (ナビゲーションとしてマークアップ) */}
            <nav aria-label="ガイドの目次" className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-3">目次</h2>
                <ul className="space-y-3 text-sm">
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">1.</span>
                        <a href="#how-to-search" className="text-blue-600 hover:underline font-medium">
                            分割乗車券の調べ方
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">2.</span>
                        <a href="#how-to-buy" className="text-blue-600 hover:underline font-medium">
                            分割乗車券の買い方
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">3.</span>
                        <a href="#how-to-use" className="text-blue-600 hover:underline font-medium">
                            分割乗車券の使い方
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">4.</span>
                        <a href="#faq" className="text-blue-600 hover:underline font-medium">
                            よくある質問（FAQ）
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">5.</span>
                        <a href="#about-logic" className="text-blue-600 hover:underline font-medium">
                            仕組みについて
                        </a>
                    </li>
                </ul>
            </nav>

            {/* コンテンツコンテナ */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 space-y-12">

                {/* 1. 分割きっぷの調べ方 */}
                <section id="how-to-search" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b pb-2 flex items-center">
                        1. 分割きっぷの調べ方
                    </h2>
                    <div className="space-y-6 text-slate-800 leading-relaxed">
                        <div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">そもそもなぜ分割するのか</h3>
                            <p>
                                基本的には<strong>安くなるから</strong>です。
                                当サイトでは、発着駅間の最安解を求めるための
                                <Link href="/split" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                    分割きっぷ計算機
                                </Link>
                                を公開してます。
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">発着駅の入力方法</h3>
                            <p>
                                検索ボックスに、発駅と着駅を入力します。入力に合わせて候補の駅名がサジェストされます。
                            </p>
                            <p className="bg-slate-50 p-4 rounded-lg text-sm text-slate-700 mt-2">
                                ※定期券およびIC定期券では、臨時駅を選択することはできません。また、IC定期券の場合、異なるエリア同士を選択することはできません。
                            </p>
                        </div>

                        <div>
                            <h3 className="text-lg font-bold text-slate-900 mb-2">計算結果画面について</h3>
                            <p>
                                計算が完了すると、通常通りに購入した場合（通し購入）と、乗車券を分割して購入した場合（分割購入）の運賃の比較が表示されます。
                            </p>
                            <ul className="list-disc list-inside space-y-1.5 ml-2 mt-2 text-sm">
                                <li><strong>分割駅の表示：</strong> どの駅で乗車券を分割すれば最も安くなるかが視覚的に示されます。</li>
                                <li><strong>運賃の比較：</strong> 分割することでいくら安くなるかの差額（オトク額）がひと目で分かります。</li>
                                <li><strong>経路の確認：</strong> 経由する路線や経由駅のリストを確認できます。</li>
                                <li><strong>パターンについて：</strong> 複数のパターンが表示された場合お好きなものを選んでください。</li>
                            </ul>
                        </div>
                    </div>
                </section>

                {/* 2. 分割乗車券の買い方 */}
                <section id="how-to-buy" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b pb-2 flex items-center">
                        2. 分割乗車券の買い方
                    </h2>
                    <div className="space-y-6 text-slate-800 leading-relaxed">
                        <p>
                            <Link href="/split" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                分割きっぷ計算機
                            </Link>
                            で出力された複数枚の乗車券を購入する手順です。
                        </p>
                        <p>
                            原則として、<strong className="underline">分割乗車券は発駅で乗車する際に、着駅までに利用する全ての乗車券を所持している必要があります。</strong>
                        </p>
                        <p>
                            ここで前提知識として、以下に記載する
                            <Link href="https://www.jreast.co.jp/ryokaku/02_hen/02_syo/01_setsu/02.html#20" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                旅客営業規則 第20条
                            </Link>
                            をご覧ください。
                        </p>
                        <blockquote className="bg-slate-50 p-4 text-slate-700 mt-2 space-y-2 border-l-4 border-slate-300">
                            <p className="text-sm">
                                駅において発売する乗車券類は、その駅から有効なものに限って発売する。ただし、他駅から有効な乗車券類を発売することがある。
                            </p>
                            <cite className="block text-xs text-slate-500 not-italic">
                                出典:
                                <Link href="https://www.jreast.co.jp/ryokaku/02_hen/02_syo/01_setsu/02.html" target="_blank" className="hover:underline underline-offset-2 mx-1">
                                    JR東日本：旅客営業規則＞第2編 旅客営業 -第2章 乗車券類の発売 -第1節 通則
                                </Link>
                            </cite>
                        </blockquote>
                        <p>
                            つまり、<strong className="underline">必ずしも駅の券売機やみどりの窓口（きっぷうりば）で分割乗車券を購入できるとは限りません。</strong>
                        </p>

                        <div className="space-y-4">
                            <AccordionItem title="分割乗車券の購入方法">
                                <p>
                                    乗車券を分割購入したいときは
                                    <Link href="https://www.eki-net.com" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                        えきねっと
                                    </Link>
                                    や
                                    <Link href="https://e5489.jr-odekake.net/e5489/cspc/CBTopMenuPC" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                        e5489
                                    </Link>
                                    などのインターネット予約サービスを使うと便利です。
                                    これらを利用すれば他駅発売の制限を受けませんが、受け取りできる駅が限られているため注意が必要です。
                                    近年、みどりの窓口（きっぷうりば）では、不正乗車防止の観点から発売してもらえる可能性は低くなりつつあります。
                                </p>
                                <p>
                                    ※近距離きっぷでも分割乗車券として利用できます。
                                    ただ、出場時に発駅から分割駅までの運賃と一致しているかの確認に時間を要する可能性があります。
                                    指定席券売機（みどりの券売機）やみどりの窓口（きっぷうりば）があれば、駅名→駅名となる乗車券（マルス券）の購入がおすすめです。
                                </p>
                                <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                                    <p className="font-bold text-slate-800">【例】東京駅から横浜駅まで</p>
                                    <p>
                                        東京→横浜は530円ですが、東京→蒲田と蒲田→横浜はそれぞれ260円です。
                                        よって、分割することで10円安く移動することができます。
                                        このとき、東京駅の自動券売機で東京→蒲田の乗車券を購入することはできますが、蒲田→横浜の乗車券を購入することはできません。
                                        そのため、えきねっと等を利用して蒲田→横浜の乗車券を事前に購入し、東京駅で受け取る必要があります。
                                    </p>
                                </div>
                            </AccordionItem>

                            <AccordionItem title="分割定期券の購入方法">
                                <div className="space-y-4">
                                    <div>
                                        <p className="font-bold text-slate-800">【磁気定期券】</p>
                                        <p>
                                            駅の券売機やみどりの窓口で購入をしてください。購入後は有人改札へ行き「入場記録が無くても出場できる設定」をしてもらうことが多いです。
                                            発売を断られたら、分割駅まで移動して購入するか諦めてください。
                                        </p>
                                    </div>
                                    <hr className="border-slate-100" />
                                    <div>
                                        <p className="font-bold text-slate-800">【Kitaca／Suica定期券】</p>
                                        <p>
                                            各定期券を取り扱う駅の窓口で購入してください。最大分割数は1回（2区間）までで、他社線を含めることはできません。
                                        </p>
                                    </div>
                                    <hr className="border-slate-100" />
                                    <div>
                                        <p className="font-bold text-slate-800">【ICOCA定期券】</p>
                                        <p>
                                            ICOCA定期券を取り扱う駅の窓口で購入してください。最大分割数は1回（2区間）までで、他社線を含めることはできません。
                                            詳しくは
                                            <Link href="https://www.jr-odekake.net/icoca/purchase/icoca_teiki.html#two" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                                こちら
                                            </Link>
                                            をご覧ください。
                                        </p>
                                    </div>
                                    <hr className="border-slate-100" />
                                    <div>
                                        <p className="font-bold text-slate-800">【モバイルSuicaの定期券】</p>
                                        <p>
                                            <Link href="https://apfaq.mobilesuica.com/helpdesk?category_id=85" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                                モバイルSuicaサポートページ
                                            </Link>
                                            に沿って購入してください。最大分割数は1回（2区間）までで、他社線を含めることはできません。
                                        </p>
                                    </div>
                                </div>
                            </AccordionItem>
                        </div>
                    </div>
                </section>

                {/* 3. 分割乗車券の使い方 */}
                <section id="how-to-use" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b pb-2 flex items-center">
                        3. 分割乗車券の使い方
                    </h2>
                    <div className="space-y-6 text-slate-800 leading-relaxed">
                        <p>
                            <Link href="/split" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                分割きっぷ計算機
                            </Link>
                            で出力された複数枚の乗車券を利用する手順です。
                        </p>

                        <AccordionItem title="分割乗車券の利用方法">
                            <ul className="list-disc list-inside space-y-2 ml-2 mt-2 text-sm">
                                <li><strong>入場時：</strong> 最初に乗車する区間の乗車券（発駅が含まれる乗車券）だけを使って入場します。</li>
                                <li><strong>検札時：</strong> 車内検札がある場合は、所持している分割したすべての乗車券を提示してください。</li>
                                <li><strong>出場時：</strong> 目的地の駅で出場する際は、有人改札で<strong>分割したすべての乗車券</strong>を渡してください。</li>
                            </ul>
                            <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg space-y-2">
                                <p className="font-bold text-slate-800">【例】東京駅から横浜駅まで</p>
                                <p>
                                    東京駅では「東京→蒲田」の乗車券だけを使って入場してください。
                                    このとき、蒲田駅を通過する東海道線で移動しても問題ありません。
                                </p>
                                <p className="text-rose-600 font-medium">
                                    ただし、蒲田駅を経由しない横須賀線（品鶴線経由など）を利用して移動してはいけません。なぜなら、分割駅である「蒲田駅」を実際に経由する経路で乗車する必要があるためです。
                                </p>
                                <p>
                                    横浜駅に着いたら、有人改札へ行き「東京→蒲田」と「蒲田→横浜」の両方の乗車券を渡せば出場できます。
                                </p>
                            </div>
                        </AccordionItem>

                        <AccordionItem title="分割定期券の利用方法">
                            <div className="space-y-4">
                                <div>
                                    <p className="font-bold text-slate-800">【磁気定期券】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2 mt-1 text-sm">
                                        <li><strong>入場時：</strong> 最初に乗車する区間の定期券だけを使って入場します。</li>
                                        <li><strong>検札時：</strong> 分割したすべての定期券を提示してください。</li>
                                        <li><strong>出場時：</strong> 最後に乗車する区間の定期券だけを使って出場します。</li>
                                    </ul>
                                </div>
                                <hr className="border-slate-100" />
                                <div>
                                    <p className="font-bold text-slate-800">【ICカード／モバイルSuica定期券】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2 mt-1 text-sm">
                                        <li><strong>入場時：</strong> 自動改札機にタッチして入場します。</li>
                                        <li><strong>検札時：</strong> ICカードの券面、またはアプリ画面を提示してください。</li>
                                        <li><strong>出場時：</strong> 自動改札機にタッチして出場します。</li>
                                    </ul>
                                </div>
                            </div>
                        </AccordionItem>
                    </div>
                </section>

                {/* 4. よくある質問 */}
                <section id="faq" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b pb-2 flex items-center">
                        4. よくある質問（FAQ）
                    </h2>
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-slate-900 mb-2">【全般】</h3>

                        <FaqItem question="分割乗車券は違法ではありませんか？">
                            <p>
                                いいえ、全く問題ありません。
                                <Link href="https://www.jreast.co.jp/ryokaku/02_hen/04_syo/02_setsu/03.html" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                    旅客営業規則 第157条
                                </Link>
                                にも、2枚以上の乗車券を併用して使用することが想定された条文が存在します。
                            </p>
                        </FaqItem>

                        <FaqItem question="分割するデメリットはありますか？">
                            <p>はい、あります。主に以下の2点です。</p>
                            <ul className="list-disc list-outside ml-5 mt-2 space-y-1">
                                <li>
                                    払い戻しの際に、乗車券の枚数分
                                    <Link href="https://www.jreast.co.jp/kippu/22.html" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                        手数料
                                    </Link>
                                    がかかる。
                                </li>
                                <li>
                                    <Link href="https://www.jreast.co.jp/ryokaku/02_hen/07_syo/03_setsu/10.html" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                        列車の運行不能・遅延等の場合の取扱方
                                    </Link>
                                    が通しの乗車券と異なる場合がある。
                                </li>
                            </ul>
                        </FaqItem>

                        <h3 className="text-lg font-bold text-slate-900 mb-2">【乗車券について】</h3>

                        <FaqItem question="ICカードを使って分割乗車できますか？">
                            <p>
                                分割駅で下車をして、自動改札機で「出場」と「入場」をする必要があります。
                                なお、当サイトではICカード運賃は考慮されていません。
                            </p>
                        </FaqItem>

                        <FaqItem question="発駅が無人駅で乗車券を持たないまま乗車する場合どうすればいいですか？">
                            <p>
                                基本的に分割乗車券は諦めてください。
                                乗車券を持たないまま分割駅を通り過ぎて、着駅で分割乗車券が発売されることはありません。
                            </p>
                        </FaqItem>

                        <FaqItem question="発駅で分割乗車券の1枚目の乗車券だけ購入した場合どうなりますか？">
                            <p>
                                多くの場合は、乗越精算となるため安くならないです。
                                打切計算となる場合は安くなります。
                                詳しくは
                                <Link href="https://jreastfaq.jreast.co.jp/faq/show/1168" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                    こちら
                                </Link>
                                をご覧ください。
                            </p>
                            <div className="mt-4 p-3 bg-white border border-slate-200 rounded-lg space-y-1">
                                <p className="font-bold text-slate-800">【例】東京駅から横浜駅まで</p>
                                <p>
                                    東京→横浜は530円ですが、東京→蒲田と蒲田→横浜はそれぞれ260円です。
                                    よって、分割することで10円安く移動することができます。
                                    このとき、東京駅の自動券売機で東京→蒲田の乗車券を購入することはできますが、蒲田→横浜の乗車券を購入することはできません。
                                    東京→蒲田の乗車券を使って横浜駅で乗越精算をしても、東京駅からの差額精算となり530円 － 260円 ＝ 270円を支払うことになりやすく移動ができません。
                                </p>
                            </div>
                        </FaqItem>

                        <FaqItem question="分割した乗車券で、途中下車はできますか？">
                            <p>
                                下車したい駅が含まれる乗車券次第です。
                                詳しくは
                                <Link href="https://www.jreast.co.jp/kippu/05.html" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                    こちら
                                </Link>
                                をご覧ください。
                                もちろん、分割駅で降りることはできます。
                            </p>
                        </FaqItem>

                        <FaqItem question="特急券も分割する必要はありますか？">
                            <div>
                                <p>
                                    特急券は分割せず、通しで購入して問題ありません。
                                </p>
                                <p className="text-xs">
                                    ※特急券も分割して購入したほうが安くなる場合があります。
                                </p>
                            </div>
                            <div>
                                <p>
                                    新幹線の自動改札機では、分割した乗車券や特急券の利用ができます。
                                    このとき、必ず実乗車経路と乗車券の経路が一致していることを確認してください。
                                </p>
                                <p className="text-xs">
                                    ※当サイトのプログラムはJR在来線のみを対象としており、新幹線や在来線特急の料金計算には現在対応していません。また、自動改札機には一度に投入できる枚数制限があります。
                                </p>
                            </div>
                        </FaqItem>

                        <FaqItem question="学割など、割引乗車券の分割計算はできますか？">
                            <ul className="list-disc list-outside ml-5 mt-2 space-y-1">
                                <li>
                                    <strong>学生割引乗車券</strong> および <strong>小児の旅客運賃：</strong>
                                    対応を検討中です。
                                </li>
                                <li>
                                    <strong>通学定期券：</strong>
                                    分割して購入することはできません。
                                    詳しくは
                                    <Link href="https://www.jreast.co.jp/railway/teiki/school.html/#basic_03" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                        こちら
                                    </Link>
                                    をご覧ください。
                                </li>
                                <li>
                                    <strong>オフピーク定期券：</strong>
                                    分割して購入することはできません。
                                    詳しくは
                                    <Link href="https://jreastfaq.jreast.co.jp/faq/show/2956" target="_blank" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                        こちら
                                    </Link>
                                    をご覧ください。
                                </li>
                            </ul>
                        </FaqItem>
                    </div>
                </section>

                {/* 5. 仕組みについて */}
                <section id="about-logic" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-900 mb-6 border-b pb-2 flex items-center">
                        5. 仕組みについて
                    </h2>
                    <div className="space-y-4 text-slate-800 leading-relaxed">
                        <p>
                            きっぷナビがどのようにして最安経路や分割パターンを計算しているか、なぜ安くなるか、数学的な背景や探索アルゴリズムについて解説した技術資料を用意しています。
                        </p>
                        <p>
                            最安値の計算ロジックや、同額パターンの完全列挙など、当サイトの裏側にあるプログラムの仕組みに興味がある方は、以下の詳細ページをご覧ください。どのように運営されているかの技術情報も含まれております。
                        </p>
                        <div className="pt-2">
                            <Link href="/logic" className="text-blue-600 hover:underline decoration-blue-600 underline-offset-2 mx-1">
                                計算の仕組み・技術情報を見る
                            </Link>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
