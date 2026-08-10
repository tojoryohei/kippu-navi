import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import error from "./error.jpeg";
import ss1 from "./ss1.png";
import ss2 from "./ss2.png";
import ss3 from "./ss3.png";
import ss4 from "./ss4.png";
import edmondson from "./edmondson.jpeg";
import mars from "./mars.jpeg";

export const metadata: Metadata = {
  title: "分割乗車券の買い方ガイド（えきねっと編）",
  description: "えきねっとで分割乗車券を実際に購入する方法を手順ごとに解説。他駅発売の制限や注意点も紹介します。",
  alternates: {
    canonical: "/articles/how-to-buy-split-ticket",
  },
};

export default function HowToBuySplitTicketPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: '分割乗車券の買い方ガイド（えきねっと編）',
    description: 'えきねっとで分割乗車券を実際に購入する方法を手順ごとに解説。他駅発売の制限や注意点も紹介します。',
    url: 'https://kippu-navi.com/articles/how-to-buy-split-ticket',
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
          <span>分割乗車券の買い方ガイド（えきねっと編）</span>
        </nav>

        <article className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
          <header className="mb-8">
            <span className="text-xs px-2.5 py-1 rounded-full font-bold bg-emerald-100 text-emerald-700">実践</span>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mt-4 leading-tight">
              {"分割乗車券の買い方ガイド（えきねっと編）"}
            </h1>
            <p className="mt-4 text-slate-500 text-sm">最終更新: 2026年8月5日</p>
          </header>

          <div className="prose prose-slate max-w-none space-y-8 text-slate-700 leading-relaxed">

            {/* 今回解説する例 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">今回解説する例：東京→蒲田→横浜</h2>
              <p>
                {"この記事では、「東京駅から横浜駅まで」の分割乗車券を例に、えきねっとを使った購入手順を解説します。"}
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                      <th className="py-3 px-4 font-bold">区間</th>
                      <th className="py-3 px-4 font-bold">運賃</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-slate-800">東京 → 横浜（通しで購入）</td>
                      <td className="py-3 px-4 font-bold text-slate-800">530円</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-slate-800">東京 → 蒲田（1枚目）</td>
                      <td className="py-3 px-4">260円</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 text-slate-800">蒲田 → 横浜（2枚目）</td>
                      <td className="py-3 px-4">260円</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="py-3 px-4 font-bold text-blue-800">合計（分割購入）</td>
                      <td className="py-3 px-4 font-bold text-blue-700">520円（10円お得）</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-4">
                {"1枚目（東京→蒲田）は東京駅の券売機でも購入ができますが、2枚目（蒲田→横浜）は、東京駅の券売機で購入できません。"}
                {"これは不正防止のために、他駅を発着とする短距離乗車券には発売制限が設けられているからです。"}
                {"ここでえきねっとを使うことで、この制限を回避できます。"}
              </p>
              <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="font-bold">なぜ他駅発の乗車券は買えないの？</span>
                <p className="mt-1">{"旅客営業規則 第20条の「駅において発売する乗車券類は、その駅から有効なものに限って発売する」という原則があるためです。ただし、えきねっとはこの制限の対象外です。"}</p>
              </div>
              <figure className="mt-4">
                <Image
                  src={error}
                  alt="指定席券売機で他駅発の乗車券を購入しようとした際のエラー画面。購入できない旨のメッセージが表示されている。"
                  className="w-full rounded-lg border border-slate-200 shadow-sm"
                />
                <figcaption className="text-xs text-center text-slate-400 mt-1">▲ 指定席券売機で他駅発の乗車券を購入しようとするとエラーになる</figcaption>
              </figure>
            </section>

            {/* 1枚目の乗車券をどこで買うか */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">1枚目（東京→蒲田）はどこで買う？</h2>
              <p>
                {"1枚目の「東京→蒲田（260円）」は発駅が東京駅なので、東京駅の自動券売機でも購入できます。"}
                {"ただし、えきねっとでまとめて購入することをおすすめします。"}
              </p>
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-700 font-semibold">
                      <th className="py-3 px-4 font-bold">購入方法</th>
                      <th className="py-3 px-4 font-bold">メリット</th>
                      <th className="py-3 px-4 font-bold">デメリット</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">駅の自動券売機</td>
                      <td className="py-3 px-4">当日でも素早く購入できる</td>
                      <td className="py-3 px-4">現金やクレジットカードを用意する必要がある</td>
                    </tr>
                    <tr className="bg-blue-50">
                      <td className="py-3 px-4 font-medium text-blue-800 whitespace-nowrap">えきねっと（推奨）</td>
                      <td className="py-3 px-4 text-blue-800">指定席券売機でQRコードを使って素早く受け取れる</td>
                      <td className="py-3 px-4 text-blue-800">事前にインターネット上で購入する必要がある</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm">
                {"あらかじめえきねっとで全区間をまとめて購入しておくと、指定席券売機でQRコードをかざすだけで乗車券を受け取ることができます。"}
                {"券売機の前で現金やクレジットカードを用意する必要がなくなるため便利です。"}
              </p>

              {/* エドモンソン券 vs マルス券 */}
              <div className="mt-6">
                <h3 className="font-bold text-slate-800 text-base mb-2">きっぷの種類：マルス券を選ぶことを推奨</h3>
                <p className="text-sm">
                  {"自動券売機で購入した場合、きっぷは「東京→260円区間」と印字された"}
                  <strong>{"エドモンソン券"}</strong>
                  {"（着駅が金額式の小さなきっぷ）で発行されます。一方、指定席券売機やえきねっとで購入した場合は「東京→蒲田」と着駅名が明記された"}
                  <strong>{"マルス券"}</strong>
                  {"（青みがかった大判のきっぷ）で発行されます。"}
                </p>
                <p className="mt-2 text-sm">
                  {"分割きっぷを有人改札で提示する際、マルス券の方が区間が連続していることを駅員がひと目で確認できるため、スムーズに通過できます。"}
                  {"指定席券売機やえきねっとで購入するとマルス券が発行されるため、その点でも推奨です。"}
                </p>
                <div className="mt-4 grid sm:grid-cols-2 gap-4">
                  <figure>
                    <Image
                      src={edmondson}
                      alt="エドモンソン券の例。東京→260円区間と印字された小さな厚紙のきっぷ。自動券売機で購入した場合に発行される。"
                      className="w-full border border-slate-200 shadow-sm"
                    />
                    <figcaption className="text-xs text-center text-slate-500 mt-1">エドモンソン券：「東京→260円区間」と印字</figcaption>
                  </figure>
                  <figure>
                    <Image
                      src={mars}
                      alt="マルス券の例。東京→蒲田と着駅名が明記された青みがかった大判のきっぷ。指定席券売機やえきねっとで購入した場合に発行される。"
                      className="w-full border border-slate-200 shadow-sm"
                    />
                    <figcaption className="text-xs text-center text-slate-500 mt-1">マルス券：「東京→蒲田」と着駅名が明記</figcaption>
                  </figure>
                </div>
              </div>
            </section>

            {/* えきねっとでの手順 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">えきねっとで購入する手順</h2>
              <p>
                {"JR東日本のオンライン予約サービス「えきねっと」を使えば、乗車券をオンラインで購入し、出発駅の指定席券売機で受け取ることができます。"}
                {"分割した区間ごとに予約を行います。"}
              </p>

              {/* STEP 1 */}
              <div className="mt-6 space-y-2">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 1</span>
                  {"えきねっとにログインし、乗車券を検索する"}
                </h3>
                <p className="text-sm">
                  <Link href="https://www.eki-net.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">えきねっと</Link>
                  {"にアクセスし、ログインします。乗車駅に「東京」、降車駅に「蒲田」を入力し、乗車日・時刻・人数を設定します。"}
                </p>
                <p className="text-sm mt-1">
                  {"次に「続きを表示する」を押して検索オプションを展開し、「乗車券のみ購入」にチェックを入れてから「列車を検索する」をクリックします。"}
                </p>
                <figure className="mt-3 space-y-3">
                  <Image
                    src={ss1}
                    alt="えきねっとの列車検索画面。乗車駅に東京、降車駅に蒲田を入力し、乗車日・時刻・人数を設定した状態。分割乗車券購入の入力例。"
                    className="w-full rounded-lg border border-slate-200 shadow-sm"
                  />
                  <figcaption className="text-xs text-center text-slate-400">▲ 乗車駅・降車駅・乗車日を入力する</figcaption>
                  <Image
                    src={ss2}
                    alt="えきねっとの列車検索オプション画面。「続きを表示する」を開き、「乗車券のみ購入」にチェックを入れた状態。分割乗車券をえきねっとで購入する際の設定。"
                    className="w-full rounded-lg border border-slate-200 shadow-sm"
                  />
                  <figcaption className="text-xs text-center text-slate-400">▲「続きを表示する」を押し、「乗車券のみ購入」にチェックを入れる</figcaption>
                </figure>
              </div>

              {/* STEP 2 */}
              <div className="mt-6 space-y-2">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 2</span>
                  {"経路検索結果から「きっぷ・座席の種類選択へ進む」"}
                </h3>
                <p className="text-sm">
                  {"検索結果画面に経路と運賃（東京→蒲田 260円）が表示されます。乗車する列車の「きっぷ・座席の種類選択へ進む」をタップします。"}
                </p>
                <figure className="mt-3">
                  <Image
                    src={ss3}
                    alt="えきねっとの経路検索結果画面。東京から蒲田の経路が表示され、260円と記載されている。"
                    className="w-full rounded-lg border border-slate-200 shadow-sm"
                  />
                  <figcaption className="text-xs text-center text-slate-400 mt-1">▲ 経路検索結果画面</figcaption>
                </figure>
              </div>

              {/* STEP 3 */}
              <div className="mt-6 space-y-2">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 3</span>
                  {"「乗車券（紙のきっぷ）を申込む」を選択する"}
                </h3>
                <p className="text-sm">
                  {"きっぷの種類を選択する画面が表示されます。「乗車券（紙のきっぷ）を申込む」を選択してください。QRチケットでは分割乗車券として利用できないため、必ず紙のきっぷを選択します。"}
                </p>
                <figure className="mt-3">
                  <Image
                    src={ss4}
                    alt="えきねっとの乗車券申込画面。乗車券（紙のきっぷ）を申込むが選択されている状態。"
                    className="w-full rounded-lg border border-slate-200 shadow-sm"
                  />
                  <figcaption className="text-xs text-center text-slate-400 mt-1">▲ 「乗車券（紙のきっぷ）を申込む」を選択する</figcaption>
                </figure>
              </div>

              {/* STEP 4 */}
              <div className="mt-6 space-y-2">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 4</span>
                  {"内容を確認して決済を完了する"}
                </h3>
                <p className="text-sm">
                  {"申込内容（区間・運賃・枚数）を確認し、決済を完了させます。購入後、登録メールアドレスに発券用のQRコードが届きます。"}
                </p>
              </div>

              {/* 2枚目も同様に繰り返す */}
              <div className="mt-6 space-y-2">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span className="bg-gray-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">繰り返し</span>
                  {"2枚目（蒲田→横浜）も同様にSTEP 1〜4を行う"}
                </h3>
                <p className="mt-2 text-sm text-slate-700">
                  {"1枚目の購入が完了したら、引き続き2枚目の乗車券を購入します。"}
                  {"STEP 1〜4と同じ手順で、乗車駅を「蒲田」、降車駅を「横浜」に変えて検索・購入してください。"}
                </p>
              </div>

              {/* STEP 5 */}
              <div className="mt-6 space-y-2">
                <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
                  <span className="bg-blue-600 text-white text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap shrink-0">STEP 5</span>
                  {"出発駅の指定席券売機で乗車券を受け取る"}
                </h3>
                <p className="text-sm">
                  {"東京駅の指定席券売機（緑色の券売機）でそれぞれのQRコードをかざすと、乗車券が発券されます。"}
                </p>
              </div>
              <p className="mt-6 text-xs text-slate-700">
                {"※ 本記事のスクリーンショットは"}
                <Link href="https://www.eki-net.com" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">えきねっと</Link>
                {"より引用しています。"}
              </p>
            </section>

            {/* 購入時の注意点 */}
            <section>
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">購入時の注意点</h2>
              <ul className="list-disc list-outside ml-5 space-y-3 text-sm">
                <li>
                  <span className="font-bold">えきねっとのチケットレス乗車券（QRチケット）は使えない</span>
                  <p className="mt-1">
                    {"えきねっとのチケットレスサービス（スマホ画面のQRコードで乗車するタイプ）は自動改札の入出場が前提となるため、分割乗車券には対応していません。必ず紙のきっぷで発券してください。"}
                  </p>
                </li>
                <li>
                  <span className="font-bold">受け取り時間に注意</span>
                  <p className="mt-1">
                    {"えきねっとで購入した乗車券は紙のきっぷとして受け取る必要があります。"}
                    {"受け取り時間は原則5時00分～23時30分ですが、駅によってはみどりの窓口や指定席券売機が設置されていない場合があります。"}
                  </p>
                </li>
                <li>
                  <span className="font-bold">受け取り可能駅に注意</span>
                  <p className="mt-1">
                    {"えきねっとはJR全線の乗車券に対応していますが、受け取りはJR東日本の駅の指定席券売機・みどりの窓口で行う必要があります。"}
                    {"JR北海道・JR東海・JR西日本の一部の駅でも受け取りが可能ですが、受け取りができないきっぷがあります。"}
                    {"詳しくは"}
                    <Link href="https://www.eki-net.com/top/jrticket/guide/uketori" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">こちら</Link>
                    {"をご覧ください。"}
                    {"JR西日本エリアでの受け取りには"}
                    <Link href="https://e5489.jr-odekake.net/e5489/cspc/CBTopMenuPC" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">e5489</Link>
                    {"、JR九州エリアでは"}
                    <Link href="https://train.yoyaku.jrkyushu.co.jp" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline underline-offset-2">列車予約サービス</Link>
                    {"を合わせて利用すると便利です。"}
                  </p>
                </li>
              </ul>
            </section>

          </div>

          <div className="mt-10 pt-8 border-t border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-4">関連記事</h2>
            <ul className="space-y-2 text-sm">
              <li><Link href="/articles/how-to-buy-split-pass" className="text-blue-600 hover:underline">→ 分割定期券の買い方ガイド</Link></li>
              <li><Link href="/articles/what-is-split-ticket" className="text-blue-600 hover:underline">→ 分割きっぷとは？仕組みをわかりやすく解説</Link></li>
              <li><Link href="/articles/merit-demerit" className="text-blue-600 hover:underline">→ 分割きっぷのメリット・デメリットまとめ</Link></li>
            </ul>
          </div>
        </article>
      </div>
    </>
  );
}
