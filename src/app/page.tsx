import Link from 'next/link';
import { RiScissorsFill, RiGuideLine } from "react-icons/ri";
import { getChangelogs } from '@/app/lib/changelog';

export const metadata = {
  title: "きっぷナビ",
  description: "JRの運賃計算プログラムや最も安くなるきっぷの組み合わせを計算する最安分割乗車券プログラムを公開しています。",
};

export default async function Home() {
  const recentChangelogs = await getChangelogs(3);
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto space-y-12">

        {/* ヒーローセクション */}
        <div className="text-center space-y-6">
          <h1 className="text-4xl font-extrabold text-slate-900 tracking-tight sm:text-5xl">
            きっぷナビへようこそ
          </h1>
          <p className="max-w-2xl mx-auto text-base sm:text-lg text-slate-600 leading-relaxed">
            発駅と着駅を指定するだけで、最も安い分割乗車券の組み合わせを計算します。
            また、開発の基盤となっている運賃計算プログラムもお試しいただけます。
          </p>
        </div>

        {/* リンクカードセクション */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* 分割運賃プログラム */}
          <Link href="/split" className="group bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-blue-500 transition-all duration-300 flex flex-col h-full">
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-blue-100 p-3 rounded-xl group-hover:bg-blue-600 transition-colors duration-300">
                <RiScissorsFill className="w-7 h-7 text-blue-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors duration-300">
                JR分割乗車券プログラム
              </h2>
            </div>
            <p className="text-slate-600 mb-6 grow">
              一番安くなる分割乗車券の組み合わせを検索します。実際の旅行や交通費の節約に活用したい方はこちらをご利用ください。いわゆる分割定期券にも対応しました。
            </p>
            <div className="text-blue-600 font-bold flex items-center group-hover:translate-x-2 transition-transform duration-300">
              分割計算をする
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </div>
          </Link>

          {/* 運賃計算プログラム */}
          <Link href="/mr" className="group bg-white p-8 rounded-2xl shadow-sm border border-slate-200 hover:shadow-md hover:border-slate-400 transition-all duration-300 flex flex-col h-full">
            <div className="flex items-center space-x-4 mb-4">
              <div className="bg-slate-100 p-3 rounded-xl group-hover:bg-slate-700 transition-colors duration-300">
                <RiGuideLine className="w-7 h-7 text-slate-600 group-hover:text-white transition-colors duration-300" />
              </div>
              <h2 className="text-2xl font-bold text-slate-800">
                JR運賃計算プログラム
              </h2>
            </div>
            <p className="text-slate-600 mb-6 grow">
              分割計算の基礎となる、JR乗車券の運賃を計算します。
            </p>
            <div className="text-slate-700 font-bold flex items-center group-hover:translate-x-2 transition-transform duration-300">
              運賃を計算する
              <svg className="w-5 h-5 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
            </div>
          </Link>
        </div>

        {/* 1. きっぷナビが提供する価値 */}
        <div className="mt-16 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
            きっぷナビが提供する価値
          </h2>
          <div className="space-y-4 text-slate-600 leading-relaxed">
            <p>
              JRの運賃は乗車経路に応じて計算されますが、途中の駅で乗車券を区切って購入する「分割乗車券」を利用することで、通しで購入するよりも安くなるケースが存在します。
            </p>
            <p>
              しかし、数ある駅の中から最も安くなる分割パターンを見つけ出すのは非常に困難です。当サイトでは、情報工学に基づいた独自の経路探索アルゴリズムを活用し、出発駅から到着駅までの多くの組み合わせから「最安となる分割乗車券の組み合わせ」を自動算出します。
            </p>
          </div>
        </div>

        {/* 2. 実績データ */}
        <div className="mt-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800 mb-4 border-b pb-2">
            独自のアルゴリズムによる節約実績
          </h2>
          <div className="space-y-4 text-slate-600 leading-relaxed">
            <p>
              当サイトの計算アルゴリズムは、2026年3～4月にユーザーが実行した1,625通りの計算データに基づくと、高い節約効果を出しています。
            </p>
            <ul className="list-disc list-inside bg-slate-50 p-4 rounded-lg space-y-2 mt-4 text-slate-700">
              <li><strong>一般的なルート：</strong> 本システムを利用することで<strong>平均して約123円（中央値：70円）の運賃削減</strong>を確認しました。</li>
              <li><strong>最大割引額：</strong> 長距離や複雑な境界線を跨ぐルートにおいて、1回の乗車で1,000円以上の差額が発生した事例も存在します。</li>
            </ul>
            <p className="text-sm mt-4">
              ※実際の割引額や分割枚数は、利用する区間やJRの最新の運賃改定状況によって変動します。また、分割乗車券が最安の移動方法とは限らないため、他の交通手段と比較検討することもおすすめします。
            </p>
          </div>
        </div>

        {/* 3. お知らせ・更新情報（最新3件のみ） */}
        <div className="mt-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <div className="flex justify-between items-end mb-4 border-b pb-2">
            <h2 className="text-2xl font-bold text-slate-800">
              お知らせ・更新情報（最新3件）
            </h2>
            <Link href="/changelog" className="text-sm text-blue-600 hover:underline font-bold">
              一覧を見る →
            </Link>
          </div>
          <ul className="space-y-3">
            {recentChangelogs.length > 0 ? (
              recentChangelogs.map((item, index) => (
                <li key={index} className="flex flex-col sm:flex-row sm:items-start text-slate-600 pb-3 border-b border-slate-50 last:border-0 last:pb-0">

                  {/* 左側：日付とタグのコンテナ */}
                  <div className="flex sm:flex-col items-center sm:items-start gap-2 mr-4 mb-2 sm:mb-0 shrink-0 mt-0.5 sm:w-28">
                    <span className="text-sm font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">
                      {item.date}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-bold w-fit
                      ${item.tag === 'アップデート' ? 'bg-blue-100 text-blue-700' :
                        item.tag === '修正' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-slate-200 text-slate-700'}`}
                    >
                      {item.tag}
                    </span>
                  </div>

                  {/* 右側：バージョンと内容 */}
                  <div className="space-y-1">
                    <span className="font-bold text-sm">
                      {item.url ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                          title="GitHubで確認する"
                        >
                          {item.version}
                        </a>
                      ) : (
                        <span className="text-slate-700">{item.version}</span>
                      )}
                    </span>
                    {item.contents.map((text, i) => (
                      <p key={i} className="text-sm leading-relaxed text-slate-600">{text}</p>
                    ))}
                  </div>

                </li>
              ))
            ) : (
              <li className="text-slate-500 text-sm">現在、新しいお知らせはありません。</li>
            )}
          </ul>
        </div>

        {/* 4. よくある質問 (FAQ) */}
        <div className="mt-8 bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
          <h2 className="text-2xl font-bold text-slate-800 mb-6 border-b pb-2">
            よくある質問 (FAQ)
          </h2>
          <div className="space-y-4">

            {/* Q1 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-start">
                <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                <span className="mt-0.5">分割乗車券は違法ではありませんか？</span>
              </h3>
              <div className="mt-3 flex items-start">
                <span className="shrink-0 bg-slate-200 text-slate-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                <div className="mt-0.5 text-slate-600 leading-relaxed">
                  いいえ、全く問題ありません。JRの旅客営業規則に則った正当な乗車券の購入方法です。
                  <Link href="https://www.jreast.co.jp/ryokaku/02_hen/04_syo/02_setsu/03.html" className="text-blue-600 underline decoration-blue-600 underline-offset-2 mx-1">
                    旅客営業規則 第157条
                  </Link>
                  にも、複数枚のきっぷを併用して使用することが想定された条文が存在します。
                </div>
              </div>
            </div>

            {/* Q2 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-start">
                <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                <span className="mt-0.5">分割乗車券はどのようにして買いますか？</span>
              </h3>
              <div className="mt-3 flex items-start">
                <span className="shrink-0 bg-slate-200 text-slate-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                <div className="mt-0.5 text-slate-600 leading-relaxed">
                  <Link href="https://www.eki-net.com" className="text-blue-600 underline decoration-blue-600 underline-offset-2 mr-1">
                    えきねっと
                  </Link>
                  や
                  <Link href="https://e5489.jr-odekake.net/e5489/cspc/CBTopMenuPC" className="text-blue-600 underline decoration-blue-600 underline-offset-2 mx-1">
                    e5489
                  </Link>
                  などのインターネット予約サービスを使うと便利です。駅の自動券売機やみどりの窓口では、他駅発の乗車券を発売しないことがあります。
                </div>
              </div>
            </div>

            {/* Q3 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-start">
                <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                <span className="mt-0.5">分割乗車券はどのようにして使いますか？</span>
              </h3>
              <div className="mt-3 flex items-start">
                <span className="shrink-0 bg-slate-200 text-slate-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                <div className="mt-0.5 text-slate-600 leading-relaxed">
                  改札を入場する際には分割された最初の区間のきっぷを使い、改札を出場する際には有人改札等で全てのきっぷ提示すれば問題ないです。
                </div>
              </div>
            </div>

            {/* Q4 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-start">
                <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                <span className="mt-0.5">分割するデメリットはありますか？</span>
              </h3>
              <div className="mt-3 flex items-start">
                <span className="shrink-0 bg-slate-200 text-slate-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                <div className="mt-0.5 text-slate-600 leading-relaxed">
                  <p>はい、あります。主に以下の2点です。</p>
                  <ul className="list-disc list-outside ml-5 mt-2 space-y-1">
                    <li>払い戻しの際に、きっぷの枚数分手数料がかかる。</li>
                    <li>
                      <Link href="https://www.jreast.co.jp/ryokaku/02_hen/07_syo/03_setsu/10.html" className="text-blue-600 underline decoration-blue-600 underline-offset-2 mr-1">
                        列車の運行不能・遅延等の場合の取扱方
                      </Link>
                      が異なる。
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Q5 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-start">
                <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                <span className="mt-0.5">なぜ運賃が安くなるのですか？</span>
              </h3>
              <div className="mt-3 flex items-start">
                <span className="shrink-0 bg-slate-200 text-slate-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                <div className="mt-0.5 text-slate-600 leading-relaxed">
                  <Link href="/logic" className="text-blue-600 underline decoration-blue-600 underline-offset-2 mr-1">
                    仕組み
                  </Link>
                  をご覧ください。
                </div>
              </div>
            </div>

            {/* Q6 */}
            <div className="bg-slate-50 p-5 rounded-xl border border-slate-100">
              <h3 className="font-bold text-slate-800 flex items-start">
                <span className="shrink-0 bg-blue-100 text-blue-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">Q</span>
                <span className="mt-0.5">割引乗車券やIC定期券を使った計算できますか？</span>
              </h3>
              <div className="mt-3 flex items-start">
                <span className="shrink-0 bg-slate-200 text-slate-600 w-7 h-7 rounded-full flex items-center justify-center mr-3 text-sm">A</span>
                <div className="mt-0.5 text-slate-600 leading-relaxed">
                  現在のプログラムは大人の普通乗車券と通勤定期乗車券の計算に対応しています。割引乗車券との併用計算やIC定期券の対応は今しばらくお待ちください。
                </div>
              </div>
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
