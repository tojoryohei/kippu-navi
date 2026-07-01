export const metadata = {
    title: "計算の仕組み・技術情報",
    description: "JRのきっぷを分割すると安くなる理由や、当サイトが採用している経路探索アルゴリズム、技術情報について解説します。",
};

export default function LogicPage() {
    return (
        <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">
            {/* ページヘッダー */}
            <header className="text-center mb-8">
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                    計算の仕組み・技術情報
                </h1>
                <p className="mt-8 text-slate-500">
                    当サイトは、JR線の利用において移動コストを最小化する「最安分割きっぷ」と、それを実現する経路を自動的に導出するシステムです。
                    ここでは、なぜきっぷを分割すると安くなるのかという仕組みと、当サイトを支える情報工学に基づいた計算アルゴリズムについて解説します。
                    また、どのように運営されているかの技術情報も説明します。
                </p>
            </header>

            {/* 目次 */}
            <nav className="bg-slate-50 border border-slate-200 rounded-xl p-6">
                <h2 className="text-lg font-bold text-slate-900 mb-3">目次</h2>
                <ul className="space-y-3 text-sm">
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">1.</span>
                        <a href="#why-split" className="text-blue-600 hover:underline font-medium">
                            なぜきっぷを分割すると安くなるのか？
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">2.</span>
                        <a href="#algorithm" className="text-blue-600 hover:underline font-medium">
                            当サイトの探索アルゴリズムと技術的優位性
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">3.</span>
                        <a href="#reversal-phenomenon" className="text-blue-600 hover:underline font-medium">
                            運賃の「逆転現象」への対応
                        </a>
                    </li>
                    <li className="flex items-start">
                        <span className="mr-2 text-slate-900 w-5 shrink-0">4.</span>
                        <a href="#technical-info" className="text-blue-600 hover:underline font-medium">
                            技術情報
                        </a>
                    </li>
                </ul>
            </nav>

            {/* コンテンツコンテナ */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 space-y-12">

                {/* 1. なぜきっぷを分割すると安くなるのか？ */}
                <section id="why-split" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2 flex items-center">
                        1. なぜきっぷを分割すると安くなるのか？
                    </h2>
                    <div className="space-y-6 text-slate-700 leading-relaxed">
                        <p>
                            JRの運賃は原則として乗車する営業キロの合計に基づいて算出されますが、以下の5つの要因により、途中の駅で乗車券を分割して購入した方が合計運賃が安価になるケースが存在します。
                        </p>

                        <div className="space-y-8">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">① キロ単価の非単調性</h3>
                                <p className="mb-2">
                                    運賃のキロ単価は一定ではなく、距離帯によって変動するため、分割した方が安価となる場合があります。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700">
                                    <p className="font-semibold mb-1">【例：横浜駅〜東京駅（東海道本線）の場合】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong>通しで購入：</strong> 営業キロ28.8kmは「26km～30km」の運賃帯（28kmとして計算）となり、消費税や端数処理を経て<strong>530円</strong>となります。</li>
                                        <li><strong>蒲田駅で分割：</strong> 横浜〜蒲田（14.4km）、蒲田〜東京（14.4km）はそれぞれ「10km～15km」の運賃帯（13kmとして計算）となり、260円×2枚で<strong>520円</strong>となります。</li>
                                    </ul>
                                    <p className="mt-2">結果として、分割するだけで10円安くなります。</p>
                                    <div className="w-full flex justify-center my-8 overflow-x-auto">
                                        <svg
                                            viewBox="0 0 800 250"
                                            className="w-full max-w-3xl min-w-150 h-auto font-sans"
                                            aria-label="横浜から東京までの分割乗車券の運賃比較図"
                                        >
                                            <defs>
                                                <marker
                                                    id="arrowhead"
                                                    markerWidth="10"
                                                    markerHeight="7"
                                                    refX="9"
                                                    refY="3.5"
                                                    orient="auto"
                                                >
                                                    <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                                                </marker>
                                            </defs>

                                            {/* 1. 路線（ベースとなる太い線） */}
                                            <line x1="100" y1="125" x2="700" y2="125" stroke="#9CA3AF" strokeWidth="4" />

                                            {/* 2. 上部の矢印（通し運賃：蒲田〜東京） */}
                                            <line
                                                x1="100" y1="70" x2="700" y2="70"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="400" y="55" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                530円（28.8km）
                                            </text>

                                            {/* 3. 下部の矢印1（横浜〜蒲田の分割運賃） */}
                                            <line
                                                x1="100" y1="180" x2="385" y2="180"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="242.5" y="205" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                260円（14.4km）
                                            </text>

                                            {/* 4. 下部の矢印2（蒲田〜東京の分割運賃） */}
                                            <line
                                                x1="415" y1="180" x2="700" y2="180"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="557.5" y="205" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                260円（14.4km）
                                            </text>

                                            {/* 5. 駅のノード（円）とラベル */}
                                            {/* 横浜駅 */}
                                            <circle cx="100" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="100" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">横浜</text>

                                            {/* 蒲田駅 */}
                                            <circle cx="400" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="400" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">蒲田</text>

                                            {/* 東京駅 */}
                                            <circle cx="700" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="700" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">東京</text>
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">② 特定区間運賃の利用</h3>
                                <p className="mb-2">
                                    私鉄などと競合する区間には、通常の距離制運賃よりも安い「特定運賃」が設定されていることがあり、その区間を独立させて分割することで全体が安くなります。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700">
                                    <p className="font-semibold mb-1">【例：横浜駅〜池袋駅（東海道本線・山手線）の場合】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong>通しで購入：</strong> 営業キロ37.4kmに対する通常計算で<strong>720円</strong>となります。</li>
                                        <li><strong>渋谷駅で分割：</strong> 営業キロ29.2kmに対する運賃は530円ですが、渋谷〜横浜間には東急東横線に対抗するための「特定運賃」が設定されており、特例として<strong>440円</strong>となります。池袋〜渋谷間は通常の計算よる<strong>210円</strong>です。</li>
                                    </ul>
                                    <p className="mt-2">これらを合計すると<strong>650円</strong>となり、特定運賃の恩恵を受けることで通しで買うよりも安くなります。</p>
                                    <div className="w-full flex justify-center my-8 overflow-x-auto">
                                        <svg
                                            viewBox="0 0 800 250"
                                            className="w-full max-w-3xl min-w-150 h-auto font-sans"
                                            aria-label="横浜から池袋までの分割乗車券の運賃比較図"
                                        >
                                            <defs>
                                                <marker
                                                    id="arrowhead"
                                                    markerWidth="10"
                                                    markerHeight="7"
                                                    refX="9"
                                                    refY="3.5"
                                                    orient="auto"
                                                >
                                                    <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                                                </marker>
                                            </defs>

                                            {/* 1. 路線（ベースとなる太い線） */}
                                            <line x1="100" y1="125" x2="700" y2="125" stroke="#9CA3AF" strokeWidth="4" />

                                            {/* 2. 上部の矢印（通し運賃） */}
                                            <line
                                                x1="100" y1="70" x2="700" y2="70"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="400" y="55" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                720円（37.4km）
                                            </text>

                                            {/* 3. 下部の矢印1（横浜〜渋谷の分割運賃） */}
                                            <line
                                                x1="100" y1="180" x2="485" y2="180"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="292.5" y="205" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                440円（29.2km）
                                            </text>

                                            {/* 4. 下部の矢印2（渋谷〜池袋の分割運賃） */}
                                            <line
                                                x1="515" y1="180" x2="700" y2="180"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="607.5" y="205" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                210円（8.2km）
                                            </text>

                                            {/* 5. 駅のノード（円）とラベル */}
                                            {/* 横浜駅 */}
                                            <circle cx="100" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="100" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">横浜</text>

                                            {/* 渋谷駅 */}
                                            <circle cx="500" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="500" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">渋谷</text>

                                            {/* 池袋駅 */}
                                            <circle cx="700" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="700" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">池袋</text>
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">③ 長距離区間における距離帯間隔の拡大</h3>
                                <p className="mb-2">
                                    これは①とよく似ています。営業キロが長くなるにつれて運賃が上昇する間隔が広がるため（例：50kmまでは5kmごと、101km〜600kmは20kmごと）、短距離の乗車券を別途購入して長距離側の営業キロを調整することで、全体を低減できる場合があります。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700">
                                    <p className="font-semibold mb-1">【例：福山駅〜静岡駅（山陽本線・東海道本線）の場合】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong>通しで購入：</strong> 営業キロ611.0kmは「601km～640km」の運賃帯（620kmとして計算）となり<strong>9,790円</strong>となります。</li>
                                        <li><strong>焼津駅で分割：</strong> 営業キロ597.5kmは「581km～600km」の運賃帯（590kmとして計算）となり、<strong>9,460円</strong>となります。焼津から静岡は13.5kmで240円です。1.5km分は無駄になりますが、先述の7.5km分の運賃削減効果（通し運賃の620km帯から590km帯への引き下げによる差額）が上回るため、全体として安くなります。</li>
                                    </ul>
                                    <p className="mt-2">これらを合計すると<strong>9,700円</strong>となり、営業キロの幅を小さく調整することで通しで買うよりも安くなります。</p>
                                    <div className="w-full flex justify-center my-8 overflow-x-auto">
                                        <svg
                                            viewBox="0 0 800 250"
                                            className="w-full max-w-3xl min-w-150 h-auto font-sans"
                                            aria-label="福山から静岡までの分割乗車券の運賃比較図"
                                        >
                                            <defs>
                                                <marker
                                                    id="arrowhead"
                                                    markerWidth="10"
                                                    markerHeight="7"
                                                    refX="9"
                                                    refY="3.5"
                                                    orient="auto"
                                                >
                                                    <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                                                </marker>
                                            </defs>

                                            {/* 1. 路線（ベースとなる太い線） */}
                                            <line x1="100" y1="125" x2="700" y2="125" stroke="#9CA3AF" strokeWidth="4" />

                                            {/* 2. 上部の矢印（通し運賃） */}
                                            <line
                                                x1="100" y1="70" x2="700" y2="70"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="400" y="55" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                9,790円（611.0km）
                                            </text>

                                            {/* 3. 下部の矢印1（福山〜焼津の分割運賃） */}
                                            <line
                                                x1="100" y1="180" x2="485" y2="180"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="292.5" y="205" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                9,460円（597.5km）
                                            </text>

                                            {/* 4. 下部の矢印2（焼津〜静岡の分割運賃） */}
                                            <line
                                                x1="515" y1="180" x2="700" y2="180"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="607.5" y="205" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                240円（13.5km）
                                            </text>

                                            {/* 5. 駅のノード（円）とラベル */}
                                            {/* 福山駅 */}
                                            <circle cx="100" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="100" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">福山</text>

                                            {/* 焼津駅 */}
                                            <circle cx="500" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="500" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">焼津</text>

                                            {/* 静岡駅 */}
                                            <circle cx="700" cy="125" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="700" y="152" textAnchor="middle" fill="#111827" className="text-base font-bold">静岡</text>
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">④ 電車特定区間運賃の適用</h3>
                                <p className="mb-2">
                                    割安な「電車特定区間」と通常の「幹線」をまたがって乗車する場合、全区間が割高な幹線の賃率で計算されてしまうため、境界付近で分割して電車特定区間を独立させます。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700">
                                    <p className="font-semibold mb-1">【例：久宝寺駅〜大河原駅（関西本線）の場合】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong>通しで購入：</strong> 営業キロ55.5kmは「51km～60km」の運賃帯で幹線の賃率として計算され、消費税や端数処理を経て<strong>990円</strong>となります。</li>
                                        <li><strong>法隆寺駅と木津駅で分割：</strong> 3つの分割区間の営業キロはそれぞれ「16km～20km」の運賃帯（18kmとして計算）となり、幹線運賃のままだとそれぞれ330円となります。しかし、法隆寺駅で分割することにより久宝寺駅～法隆寺駅間が電車特定区間内完結で320円となり、合計は<strong>980円</strong>となります。</li>
                                    </ul>
                                    <p className="mt-2">結果として、分割すると10円安くなります。</p>
                                    <div className="w-full flex justify-center my-8 overflow-x-auto">
                                        <svg
                                            viewBox="0 0 800 300"
                                            className="w-full max-w-3xl min-w-150 h-auto font-sans"
                                            aria-label="電車特定区間を跨ぐ分割乗車券の運賃比較図"
                                        >
                                            <defs>
                                                <marker
                                                    id="arrowhead"
                                                    markerWidth="10"
                                                    markerHeight="7"
                                                    refX="9"
                                                    refY="3.5"
                                                    orient="auto"
                                                >
                                                    <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                                                </marker>
                                            </defs>

                                            {/* 0. 電車特定区間エリア（背景の破線ボックス） */}
                                            {/* 久宝寺(100)から法隆寺(300)をすっぽり覆うように配置 */}
                                            <rect
                                                x="40"
                                                y="30"
                                                width="320"
                                                height="240"
                                                rx="12"
                                                fill="#F3F4F6"
                                                stroke="#9CA3AF"
                                                strokeWidth="2"
                                                strokeDasharray="6 4"
                                            />
                                            {/* 背景エリアのラベル */}
                                            <text x="200" y="60" textAnchor="middle" fill="#1F2937" className="text-base font-bold">
                                                電車特定区間内
                                            </text>

                                            {/* 1. 路線（ベースとなる太い線） */}
                                            <line x1="100" y1="150" x2="700" y2="150" stroke="#9CA3AF" strokeWidth="4" />

                                            {/* 2. 上部の矢印（通し運賃） */}
                                            <line
                                                x1="100" y1="100" x2="700" y2="100"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            {/* テキストは特定区間のラベルと被らないよう、右側（木津駅付近）に配置 */}
                                            <text x="500" y="85" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                990円（55.5km）
                                            </text>

                                            {/* 3. 下部の矢印1（久宝寺〜法隆寺） */}
                                            <line
                                                x1="100" y1="210" x2="285" y2="210"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="192.5" y="235" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                320円（18.6km）
                                            </text>

                                            {/* 4. 下部の矢印2（法隆寺〜木津） */}
                                            <line
                                                x1="315" y1="210" x2="485" y2="210"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="400" y="235" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                330円（18.8km）
                                            </text>

                                            {/* 5. 下部の矢印3（木津〜大河原） */}
                                            <line
                                                x1="515" y1="210" x2="700" y2="210"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="607.5" y="235" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                330円（18.1km）
                                            </text>

                                            {/* 6. 駅のノード（円）とラベル */}
                                            {/* 久宝寺駅 */}
                                            <circle cx="100" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="100" y="177" textAnchor="middle" fill="#111827" className="text-base font-bold">久宝寺</text>

                                            {/* 法隆寺駅 */}
                                            <circle cx="300" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="300" y="177" textAnchor="middle" fill="#111827" className="text-base font-bold">法隆寺</text>

                                            {/* 木津駅 */}
                                            <circle cx="500" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="500" y="177" textAnchor="middle" fill="#111827" className="text-base font-bold">木津</text>

                                            {/* 大河原駅 */}
                                            <circle cx="700" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="700" y="177" textAnchor="middle" fill="#111827" className="text-base font-bold">大河原</text>
                                        </svg>
                                    </div>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-lg font-bold text-slate-900 mb-2">⑤ 特定都区市内制度の適用または回避</h3>
                                <p className="mb-2">
                                    分割することにより、特定都区市内の特例制度を利用して運賃計算経路を短縮したり、逆に特例の適用を避けるために境界駅で分割することで安くなることがあります。
                                </p>
                                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-sm text-slate-700">
                                    <p className="font-semibold mb-1">【例：宮島口駅〜網干駅（山陽本線）の場合】</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                        <li><strong>通しで購入：</strong> 営業キロ261.1kmは「261km～280km」の運賃帯で<strong>4,840円</strong>となります。</li>
                                        <li><strong>五日市駅で分割：</strong> 五日市駅は広島市内にあるので、五日市〜東京（251.7km）は、「広島市内→網干」として中心駅の広島駅からの運賃計算です。広島～網干（239.6km）は「221～240km」の運賃帯（230kmとして計算）となり、<strong>4,070円</strong>となります。</li>
                                    </ul>
                                    <p className="mt-2">結果として、分割するだけで250円安くなります。</p>
                                    <div className="w-full flex justify-center my-8 overflow-x-auto">
                                        {/* viewBoxで描画領域を定義（幅800, 高さ280に拡張してゾーンを収める） */}
                                        <svg
                                            viewBox="0 0 800 280"
                                            className="w-full max-w-3xl min-w-150 h-auto font-sans"
                                            aria-label="特定都区市内制度による分割乗車券の逆転現象の解説図"
                                        >
                                            <defs>
                                                <marker
                                                    id="arrowhead"
                                                    markerWidth="10"
                                                    markerHeight="7"
                                                    refX="9"
                                                    refY="3.5"
                                                    orient="auto"
                                                >
                                                    <polygon points="0 0, 10 3.5, 0 7" fill="#374151" />
                                                </marker>
                                            </defs>

                                            {/* 1. 特定都区市内のゾーン（背景の点線枠） */}
                                            <rect
                                                x="250" y="20" width="300" height="175"
                                                rx="12" fill="#F3F4F6" stroke="#9CA3AF" strokeWidth="2" strokeDasharray="6 6"
                                            />
                                            <text x="400" y="55" textAnchor="middle" fill="#374151" className="text-lg font-bold">
                                                広島市内
                                            </text>

                                            {/* 2. 上部の矢印（宮島口〜網干の通し運賃） */}
                                            <text x="400" y="85" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                4,840円（261.1km）
                                            </text>
                                            <line
                                                x1="100" y1="95" x2="690" y2="95"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />

                                            {/* 3. 中心駅のラベル */}
                                            <text x="400" y="125" textAnchor="middle" fill="#4B5563" className="text-xs font-bold">
                                                中心駅
                                            </text>

                                            {/* 4. 路線（ベースとなる太い線） */}
                                            <line x1="100" y1="150" x2="700" y2="150" stroke="#9CA3AF" strokeWidth="4" />

                                            {/* 5. 下部の矢印1（宮島口〜五日市の分割運賃） */}
                                            <line
                                                x1="100" y1="220" x2="290" y2="220"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="195" y="245" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                200円（9.7km）
                                            </text>

                                            {/* 6. 下部の矢印2（広島〜網干の特定都区市内運賃） */}
                                            <line
                                                x1="410" y1="220" x2="690" y2="220"
                                                stroke="#374151" strokeWidth="2" markerEnd="url(#arrowhead)"
                                            />
                                            <text x="550" y="245" textAnchor="middle" fill="#1F2937" className="text-sm font-bold">
                                                4,070円（239.6km）
                                            </text>

                                            {/* 7. 駅のノード（円）とラベル */}
                                            {/* 宮島口駅 */}
                                            <circle cx="100" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="100" y="178" textAnchor="middle" fill="#111827" className="text-base font-bold">宮島口</text>

                                            {/* 五日市駅 */}
                                            <circle cx="300" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="300" y="178" textAnchor="middle" fill="#111827" className="text-base font-bold">五日市</text>

                                            {/* 広島駅 */}
                                            <circle cx="400" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="400" y="178" textAnchor="middle" fill="#111827" className="text-base font-bold">広島</text>

                                            {/* 網干駅 */}
                                            <circle cx="700" cy="150" r="8" fill="white" stroke="#111827" strokeWidth="3" />
                                            <text x="700" y="178" textAnchor="middle" fill="#111827" className="text-base font-bold">網干</text>
                                        </svg>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 2. 当サイトの探索アルゴリズムと技術的優位性 */}
                <section id="algorithm" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2 flex items-center">
                        2. 当サイトの探索アルゴリズムと技術的優位性
                    </h2>
                    <div className="space-y-6 text-slate-700 leading-relaxed">
                        <p>
                            既存の分割乗車券プログラムの多くは、利用者が事前に「乗車する経路」を指定する必要がありました。
                            また、計算速度を優先した単純な動的計画法（DP）では、最適化の過程で同額となる別の分割パターンが枝刈りされてしまい、出力される解が一つに限定されるという課題がありました。
                        </p>
                        <p>
                            当システムでは、情報工学におけるグラフ理論と最新のWeb技術を応用し、以下の独自アプローチを採用しています。
                        </p>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold mb-3 text-slate-900">経路指定不要の自動探索</h3>
                                <p className="text-sm text-slate-700">
                                    K-最短経路アルゴリズム（{"Yen's Algorithm"}）を応用することで、利用者が自ら経路を指定することなく、分割乗車券によって安価となる「迂回経路」も含めた候補ルートの列挙を自動で行います。
                                </p>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold mb-3 text-slate-900">ヒューリスティック探索の不採用</h3>
                                <p className="text-sm text-slate-700">
                                    A* アルゴリズムなどは高速ですが、JRには「営業キロが物理的な距離よりも短く設定されている区間」が存在します。物理的距離を推定値に用いるとコストを過大評価し最安解を見逃すリスクがあるため、解の正当性を完全に保証する手法を採用しています。
                                </p>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold mb-3 text-slate-900">同額パターンの完全列挙</h3>
                                <p className="text-sm text-slate-700">
                                    現実の鉄道利用では、分割位置による途中下車の可否など利便性を左右する要因があります。当システムは1次元DPの最適化過程で枝刈りを行わず、同額となる複数の最安分割パターンを完全に列挙し、実用上の選択肢を全て提示します。
                                </p>
                            </div>

                            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                <h3 className="text-lg font-bold mb-3 text-slate-900">多層キャッシュによる高速化</h3>
                                <p className="text-sm text-slate-700">
                                    複雑な計算アルゴリズムによるサーバー負荷を軽減するため、Cloud RunとFirebase Firestoreを連携。一度計算された解は非同期でデータベースにキャッシュされ、2回目以降の同一検索に対しては数ミリ秒での即時応答を実現しています。
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 3. 運賃の「逆転現象」への対応 */}
                <section id="reversal-phenomenon" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2 flex items-center">
                        3. 運賃の「逆転現象」への対応
                    </h2>
                    <div className="space-y-6 text-slate-700 leading-relaxed">
                        <p>
                            特定の条件下では、乗車経路を外方へ延伸することで運賃が安くなる「逆転現象」が発生します。
                            例えば、特定都区市内制度において、あえて目的地の先の駅まで切符を買うことで、発駅が都区市内中心駅からの計算に切り替わり、結果的に運賃が安くなる現象などです。
                        </p>
                        <p>
                            当システムでは、こうした複雑な運賃規則（経路特定区間や特定都区市内など）をアルゴリズムの内部に組み込み、限界距離を算出した上での枝刈りを行うことで、延伸による逆転現象も考慮した「真の最安運賃」を導出する処理を行っています。
                        </p>
                        <p>
                            ただし、区間変更を用いて運賃を安くする方法については採用していません。
                        </p>
                    </div>
                </section>

                {/* 4. 技術情報 */}
                <section id="technical-info" className="scroll-mt-20">
                    <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2 flex items-center">
                        4. 技術情報
                    </h2>
                    <div className="space-y-6 text-slate-700 leading-relaxed">
                        <p>
                            当サイトは、高度なアルゴリズムの実行とレスポンスの高速化を両立するため、現代的なWeb技術スタックとクラウドインフラを組み合わせて構築されています。
                        </p>

                        <h3 className="text-xl font-bold mb-4 text-slate-900 border-b pb-2">技術スタック</h3>
                        <div className="overflow-x-auto mb-8">
                            <table className="w-full text-left border-collapse text-sm border-slate-200">
                                <thead>
                                    <tr className="bg-slate-50 border-b border-slate-200">
                                        <th className="p-3 font-semibold text-slate-700">領域</th>
                                        <th className="p-3 font-semibold text-slate-700">技術・ツール</th>
                                        <th className="p-3 font-semibold text-slate-700">採用の目的・意図</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 text-slate-700">
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">Frontend</td>
                                        <td className="p-3">Next.js (App Router), TypeScript</td>
                                        <td className="p-3 text-slate-600">サーバーサイドレンダリング(SSR)による初期表示の高速化と、複雑な運賃ドメインモデルの型安全性担保。</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">Styling</td>
                                        <td className="p-3">Tailwind CSS</td>
                                        <td className="p-3 text-slate-600">一貫性のあるモダンなUIデザインの迅速な実装と、クリーンなスタイル管理。</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">Backend / API</td>
                                        <td className="p-3">Next.js Route Handlers</td>
                                        <td className="p-3 text-slate-600">フロントエンドと同一リポジトリ（モノレポ）で型定義やユーティリティを共有し、開発効率を最大化。</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">Database</td>
                                        <td className="p-3">Firebase Firestore</td>
                                        <td className="p-3 text-slate-600">計算コストの高い経路探索結果をキャッシュし、2回目以降の同一検索を数ミリ秒で即時応答。</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">Infrastructure</td>
                                        <td className="p-3">Google Cloud Run</td>
                                        <td className="p-3 text-slate-600">ステートレスなコンテナによる安定稼働と、アクセス状況に応じた柔軟なオートスケーリング。</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">Object Storage</td>
                                        <td className="p-3">Cloudflare R2</td>
                                        <td className="p-3 text-slate-600">経路探索に使用するグラフデータ（`graph_data.bin`）やWasmモジュール（`split_pass.wasm`）を低レイテンシかつデータ転送（エグレス）手数料無料で高速配信。</td>
                                    </tr>
                                    <tr>
                                        <td className="p-3 font-medium text-slate-900">CI/CD / DevSecOps</td>
                                        <td className="p-3">GitHub Actions, Vitest, Takumi Guard, Cloud Build</td>
                                        <td className="p-3 text-slate-600">自動テスト・Strict Lintの実施、npmパッケージのサプライチェーン攻撃対策、およびブランチごとのプレビュー環境自動生成。</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <h3 className="text-xl font-bold mb-4 text-slate-900 border-b pb-2">システムの工夫と最適化</h3>
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-lg font-semibold text-slate-900 mb-2">① 浮動小数点数演算エラーの完全排除</h4>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    JavaScriptで小数の計算を行うと、IEEE 754規格に起因する丸め誤差が発生します。
                                    JRの営業キロは「小数第1位」まで定義されているというドメイン特性を考慮し、計算前にすべてのキロ数を10倍して「整数」として扱い、最終的な出力時のみ10で割るゼロ依存のアーキテクチャを採用しています。これにより、計算精度と処理速度を極限まで両立させています。
                                </p>
                            </div>

                            <div>
                                <h4 className="text-lg font-semibold text-slate-900 mb-2">② ノンブロッキングな Fire-and-Forget キャッシュ</h4>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    新規経路探索時の計算結果をFirestoreへキャッシュ保存する際、クライアントへのレスポンス返却処理をブロックすることなく（`await`せずに）バックグラウンドで非同期書き込みを実行します。キャッシュ書き込みの遅延がユーザー体験の低下に直結しないノンブロッキング設計にしています。
                                </p>
                            </div>

                            <div>
                                <h4 className="text-lg font-semibold text-slate-900 mb-2">③ 安全かつ低コストなCI/CD運用</h4>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    GitHub Rulesetによるメインブランチ保護と自動テスト、サプライチェーン攻撃を防ぐセキュリティスキャン（Takumi Guard）を統合。
                                    また、モックデータのGitHubへのキャッシュによるGCS費用削減（FinOps）や、プルリクエストごとに Cloud Run のタグ付きデプロイを用いて動的に検証用プレビューURLを発行する体制を整えています。
                                </p>
                            </div>

                            <div>
                                <h4 className="text-lg font-semibold text-slate-900 mb-2">④ WasmとグラフデータのR2配信による高速化とコスト最適化</h4>
                                <p className="text-sm text-slate-700 leading-relaxed">
                                    運賃計算をユーザーの端末で計算させるためにWebAssemblyを採用しています。
                                    Wasmモジュール（`split_pass.wasm`）および運賃計算に必要なグラフデータ（`graph_data.bin`）は、配信にかかるデータ転送量手数料が発生しない Cloudflare R2 から配信しています。
                                    これにより、インフラコストを最小限に抑えつつ、ユーザーへのロード時間を大幅に短縮しています。
                                </p>
                            </div>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}
