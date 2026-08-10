import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import section1 from "./section1.png";
import section2 from "./section2.png";
import ss1 from "./ss1.jpeg";
import ss2 from "./ss2.jpeg";
import ss3 from "./ss3.jpeg";
import ss4 from "./ss4.jpeg";
import ss5 from "./ss5.jpeg";
import ScrollCarousel from "./StepCarousel";

export const metadata: Metadata = {
  title: "分割定期券の買い方ガイド",
  description: "磁気定期券・IC定期券・モバイルSuicaでの分割定期券を実際に購入する方法を手順ごとに解説。他駅発着の制限や、他社線を含む場合の注意点も具体例とともに紹介します。",
  alternates: {
    canonical: "/articles/how-to-buy-split-pass",
  },
};

export default function HowToBuySplitPassPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '分割定期券の買い方ガイド',
    description: '磁気定期券・IC定期券・モバイルSuicaでの分割定期券を実際に購入する方法を手順ごとに解説します。',
    url: 'https://kippu-navi.com/articles/how-to-buy-split-pass',
    author: { '@type': 'Person', name: 'きっぷナビ運営者', url: 'https://kippu-navi.com/about' },
    publisher: { '@type': 'Organization', name: 'きっぷナビ', url: 'https://kippu-navi.com' },
    datePublished: '2025-09-01',
    dateModified: '2026-08-05',
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-3xl mx-auto">
        <nav className="mb-8 text-sm text-slate-500">
          <Link href="/articles" className="text-blue-600 hover:underline">記事一覧</Link>
          <span className="mx-2">›</span>
          <span>分割定期券の買い方ガイド</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">実践</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"分割定期券の買い方ガイド"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年8月5日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-10 text-slate-700 leading-relaxed">
            
            {/* 導入 */}
            <p>
              {"区間を分割して定期券を購入することで、毎月の通勤コストを大幅に削減できる「分割定期券」。"}
              {"しかし、通常の定期券とは異なり、自動券売機やアプリからそのまま購入できません。"}
            </p>
            <p>
              {"この記事では、IC定期券（カード）・モバイルSuica・磁気定期券のそれぞれの買い方と、購入前に知っておくべき注意点を分かりやすく解説します。"}
            </p>

            {/* どの方法で買う？ */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">どの方法で買う？購入方法の比較</h2>
              <p>
                {"分割定期券は、以下の3つの方法で購入できます。JR線だけで完結する場合は"}
                <strong>{"IC定期券（カード・モバイルSuica）"}</strong>
                {"がおすすめです。"}
              </p>
              
              <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                      <th className="py-3 px-4 font-bold whitespace-nowrap">媒体</th>
                      <th className="py-3 px-4 font-bold">特徴・メリット</th>
                      <th className="py-3 px-4 font-bold">注意点・デメリット</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50 transition-colors bg-blue-50/30">
                      <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">モバイルSuica</td>
                      <td className="py-3 px-4 text-slate-800">スマホ1つで管理でき、紛失リスクがない。JR線完結の2区間（1分割）まで対応。</td>
                      <td className="py-3 px-4 text-slate-600">アプリ上で直接買えず、初回は専用フォームからの事前申請（審査）が必要。</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">IC定期券</td>
                      <td className="py-3 px-4 text-slate-800">1枚のカード（Suica等）に2区間分を記録できる。みどりの窓口で相談しながら購入可能。</td>
                      <td className="py-3 px-4 text-slate-600">他社線（私鉄・地下鉄）を含む経路は1枚にまとめられない。</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-800 whitespace-nowrap">磁気定期券</td>
                      <td className="py-3 px-4 text-slate-800">私鉄をまたぐ複雑な3分割以上の経路でも、それぞれの区間ごとに確実に発券できる。</td>
                      <td className="py-3 px-4 text-slate-600">複数枚を持ち歩く必要があり、改札を通す手間がかかる。紛失時の再発行ができない。</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* 購入前に知っておくべき「2つの大原則」 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入前に知っておくべき「2つの大原則」</h2>
              <p>
                {"分割定期券を買おうとして、「券売機でエラーになった」「窓口で断られた」というトラブルを防ぐため、以下の2つのルールを押さえておきましょう。"}
              </p>

              <div className="mt-5 space-y-4">
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2">
                    <span className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">原則1</span>
                    {"他駅発着の制限（旅客営業規則第20条）"}
                  </h3>
                  <p className="mt-2 text-sm text-amber-900 leading-relaxed">
                    {"JRの規則により、「駅において発売する乗車券類は、その駅から有効なものに限って発売する」と定められています。"}
                    {"つまり、"}<strong>{"「他の駅を出発駅とする定期券」は原則として買えません。"}</strong>
                  </p>
                </div>

                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                  <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2">
                    <span className="bg-amber-600 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">原則2</span>
                    {"1枚のICカードにまとめられるのは「JR完結の2区間」まで"}
                  </h3>
                  <p className="mt-2 text-sm text-amber-900 leading-relaxed">
                    {"1枚のSuica（モバイル・カードとも）に記録できる定期券は、最大2区間（1分割）までです。"}
                    {"また、"}<strong>{"途中に私鉄や地下鉄などの他社線が含まれる場合、1枚のICカードに分割定期券としてまとめることはできません。"}</strong>
                  </p>
                  
                  <div className="mt-4 pt-4 border-t border-amber-200/60">
                    <h4 className="font-bold text-amber-800 text-sm flex items-center gap-2 mb-2">
                      {"磁気定期券とIC定期券の「分割上限」の違いについて"}
                    </h4>
                    <p className="text-sm text-amber-900 leading-relaxed">
                      {"定期券の運賃計算方法は磁気定期券でもIC定期券でも同じですが、上記の通り、IC定期券は「2区間（1分割）」までしかまとめられません。"}
                      {"一方、紙の磁気定期券であれば、複数枚にはなりますが「3区間（2分割）」以上に分割することも可能です。"}
                      <br/><br/>
                      {"そのため、"}
                      <strong>
                        {"「IC定期券で2区間に分割して安くなった」と思っても、「磁気定期券にして3区間に分割した方がさらに安い」ケースが存在します。"}
                      </strong>
                      {"利便性（ICカード1枚で乗れること）を優先するか、最大限の節約（磁気定期券の複数枚持ち）を優先するかは、よく吟味する必要があります。"}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* 具体例と注意点 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">具体例と注意点</h2>
              
              <h3 className="text-lg font-bold text-slate-800 mt-6 mb-3">具体例①（JRで完結する場合）</h3>
              <p>
                {"【例】東京↔小山（上野東京ライン）"}
              </p>
              <div className="mt-3 mb-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                      <th className="py-2 px-4 font-bold">区間（6ヶ月定期）</th>
                      <th className="py-2 px-4 font-bold">運賃</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 text-slate-800">東京 ↔ 小山（通し）</td>
                      <td className="py-2 px-4">219,730円</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="py-2 px-4 font-bold text-blue-800">東京 ↔ 南浦和 ＋ 南浦和 ↔ 小山（分割）</td>
                      <td className="py-2 px-4 font-bold text-blue-700">217,630円（2,100円お得）</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                {"上野東京ライン（宇都宮線）は南浦和駅にホームが無く通過しますが、経路上の駅であるため分割駅として指定してもルール上問題ありません。"}
                {"JR東日本線完結のため、モバイルSuicaや1枚のSuica定期券にまとめることができます。"}
              </p>

              <h3 className="text-lg font-bold text-slate-800 mt-8 mb-3">具体例②（他社線を含める場合）</h3>
              <p>
                {"【例】逗子 ↔ ［メトロ］霞ヶ関（横須賀線・東京駅乗換・丸ノ内線）"}
              </p>
              <div className="mt-3 mb-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                      <th className="py-2 px-4 font-bold">区間（6ヶ月定期）</th>
                      <th className="py-2 px-4 font-bold">運賃</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-2 px-4 text-slate-800">逗子 ↔ 霞ヶ関（通し：JR＋メトロ）</td>
                      <td className="py-2 px-4">188,360円</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="py-2 px-4 font-bold text-blue-800">逗子 ↔ 横浜 ＋ 横浜 ↔ 霞ヶ関（分割）</td>
                      <td className="py-2 px-4 font-bold text-blue-700">184,320円（4,040円お得）</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-sm">
                {"この場合、"}<strong>{"JR区間（逗子↔横浜、横浜↔東京）とメトロ区間（東京↔霞ヶ関）が混在するため、1枚のICカードにはまとめられません。"}</strong>
              </p>
              <ul className="mt-2 list-disc list-outside ml-5 space-y-2 text-sm text-slate-700">
                <li>{"JR区間の「逗子↔横浜・横浜↔東京」を1枚のSuica定期券にまとめる。"}</li>
                <li>{"メトロ区間の「東京↔霞ヶ関」をPASMO定期券にする。"}</li>
              </ul>
              <p className="mt-3 text-sm">
                {"このように2枚持ちになります。"}
                <br/><br/>
                {"東京駅など改札外乗換となる駅では問題ありませんが、JR線と私鉄線が直通運転している境界駅（中野駅や北千住駅など）の場合はその駅で出場と入場をしないと降車駅で有人窓口へ行く必要があります。"}
                <br/><br/>
                {"また、乗り換え改札機がある駅（新宿駅や西船橋駅など）では、2枚のICカードを同時にタッチして通過することはできません。"}
                {"そのため、乗り換え改札機を使わずに一度改札を出場してから、もう一方のICカードで入場するなどの手間が発生する点に注意が必要です。"}
              </p>
            </section>

            {/* モバイルSuicaでの購入方法 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">モバイルSuicaでの購入方法</h2>
              <p>
                {"スマートフォンをお使いの場合は、持ち歩きに便利なモバイルSuicaが推奨です。"}
                {"ただし、分割定期券（2区間定期券）はアプリ上で新規購入することができません。"}
                {"以下の専用フォームから事前申請が必要です。"}
              </p>

              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 1</span>
                    {"サポートセンターへ専用フォームから申請する"}
                  </h3>
                  <p className="text-sm">
                    {"モバイルSuicaの「"}
                    <Link href="https://apfaq.mobilesuica.com/helpdesk?category_id=85&site_domain=default" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">通勤定期券/オフピーク定期券（特殊区間）新規購入お申込みフォーム</Link>
                    {"」にアクセスし、分割したい2つの区間を入力して申請します。"}
                  </p>
                  <p className="text-sm">
                    {"※オフピーク定期券の分割はできません。"}
                  </p>
                  <div className="mt-4 grid sm:grid-cols-2 gap-4">
                    <figure>
                      <Image
                        src={section1}
                        alt="モバイルSuicaの専用フォームから特殊区間定期券の申し込みを行う画面のスクリーンショット。1区間目の入力欄が表示されている。"
                        className="w-full border border-slate-200 shadow-sm"
                      />
                      <figcaption className="text-xs text-center text-slate-400 mt-1">▲ 1区間目の入力画面</figcaption>
                    </figure>
                    <figure>
                      <Image
                        src={section2}
                        alt="モバイルSuicaの専用フォームから特殊区間定期券の申し込みを行う画面のスクリーンショット。2区間目の入力欄が表示されている。"
                        className="w-full border border-slate-200 shadow-sm"
                      />
                      <figcaption className="text-xs text-center text-slate-400 mt-1">▲ 2区間目の入力画面</figcaption>
                    </figure>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 2</span>
                    {"メールの返信を待つ"}
                  </h3>
                  <p className="text-sm">
                    {"申請後、JR東日本モバイルSuicaサポートセンターで内容の確認と定期券情報の作成が行われます。"}
                    {"原則として翌日までに、購入手順の案内メールが届きます。"}
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 3</span>
                    {"モバイルSuicaアプリ内で決済・受け取り"}
                  </h3>
                  <p className="text-sm">
                    {"案内メールの指示に従い、モバイルSuicaアプリを開くと、申請した分割定期券が購入可能な状態になっています。登録済みのクレジットカード等で決済を完了させれば利用開始です。継続購入時はアプリ上からそのまま操作可能です。"}
                  </p>

                  <ScrollCarousel>
                    <div className="min-w-full snap-center snap-always p-4 flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">1 / 5</span>
                          <span className="text-sm font-bold text-slate-800">「定期券」をタップ</span>
                        </div>
                        <p className="text-xs text-slate-500">アプリTOP画面右下の「チケット購入・Suica管理」から「定期券」をタップします。</p>
                      </div>
                      <Image src={ss1} alt="モバイルSuicaアプリ - 定期券メニューを選択する画面" className="w-full h-auto rounded-xl border border-slate-200 block" />
                    </div>
                    <div className="min-w-full snap-center snap-always p-4 flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">2 / 5</span>
                          <span className="text-sm font-bold text-slate-800">「予約定期券あり」を選択</span>
                        </div>
                        <p className="text-xs text-slate-500">「定期・グリーン・チケット購入」メニューから「予約定期券あり」を選択します。</p>
                      </div>
                      <Image src={ss2} alt="モバイルSuicaアプリ - 予約定期券ありの表示画面" className="w-full h-auto rounded-xl border border-slate-200 block" />
                    </div>
                    <div className="min-w-full snap-center snap-always p-4 flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">3 / 5</span>
                          <span className="text-sm font-bold text-slate-800">区間と経路の確認</span>
                        </div>
                        <p className="text-xs text-slate-500">申請した2つの区間と経路が正しく表示されているか確認します。</p>
                      </div>
                      <Image src={ss3} alt="モバイルSuicaアプリ - 購入区間と経路の確認画面" className="w-full h-auto rounded-xl border border-slate-200 block" />
                    </div>
                    <div className="min-w-full snap-center snap-always p-4 flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">4 / 5</span>
                          <span className="text-sm font-bold text-slate-800">使用開始日・有効期間を指定</span>
                        </div>
                        <p className="text-xs text-slate-500">ご希望の使用開始日および購入期間（1・3・6ヶ月）を入力します。</p>
                      </div>
                      <Image src={ss4} alt="モバイルSuicaアプリ - 使用開始日と有効期間の選択画面" className="w-full h-auto rounded-xl border border-slate-200 block" />
                    </div>
                    <div className="min-w-full snap-center snap-always p-4 flex flex-col gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="bg-blue-600 text-white text-xs font-bold px-2.5 py-0.5 rounded-full shrink-0">5 / 5</span>
                          <span className="text-sm font-bold text-slate-800">購入内容の確認と決済</span>
                        </div>
                        <p className="text-xs text-slate-500">内容を最終確認の上、登録済みのクレジットカード等で決済を完了させます。</p>
                      </div>
                      <Image src={ss5} alt="モバイルSuicaアプリ - 購入内容確認と決済画面" className="w-full h-auto rounded-xl border border-slate-200 block" />
                    </div>
                  </ScrollCarousel>
                </div>
              </div>
            </section>

            {/* 磁気定期券・ICカードでの手順 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">磁気定期券・IC定期券（カード型）での購入方法</h2>
              <p>
                {"磁気定期券やカード型のKitaca・Suica・ICOCAに2区間（1分割）の定期券をまとめる場合は、みどりの窓口（きっぷうりば）を利用します。"}
              </p>

              <div className="mt-6 space-y-6">
                <div className="space-y-2">
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 1</span>
                    {"みどりの窓口（きっぷうりば）へ向かう"}
                  </h3>
                  <p className="text-sm">
                    {"分割定期券を購入するために窓口へ向かいます。"}
                    <br /><br />
                    {"※最寄駅に窓口が無い場合は、近隣の窓口等設置駅に到着後、有人改札口で申し出ると、みどりの窓口での定期券の発売とあわせて、運賃が払い戻されます。"}
                  </p>
                </div>

                <div className="space-y-2">
                  <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                    <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 2</span>
                    {"「2区間の定期券を1枚のICカードにしたい」と伝える"}
                  </h3>
                  <p className="text-sm">
                    {"窓口の係員に通勤定期券を分割購入したい旨を伝えます。"}
                  </p>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <h4 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                  {"他駅発着制限で断られた場合"}
                </h4>
                <p className="mt-2 text-sm text-slate-700">
                  {"もし他駅発着制限により「ここでは一方の区間しか発券できない」とされた場合、以下の手順で回避できることがあります。"}
                  <br/><br/>
                  {"1. その駅で発券できる側の区間の磁気定期券を現金で購入する。"}<br/>
                  {"2. もう一方の区間の駅へ移動し、そこで2区間目を新規購入する際に「先ほど買った磁気定期券を一緒にして1枚のICカードに移してほしい」と依頼する。"}
                </p>
              </div>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/how-to-buy-split-ticket" className="text-blue-600 hover:underline">→ 分割乗車券の買い方ガイド（えきねっと編）</Link></li>
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/merit-demerit" className="text-blue-600 hover:underline">→ 分割きっぷのメリット・デメリットまとめ</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
