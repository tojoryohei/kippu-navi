import Form from "@/app/split/components/Form";
import type { Metadata } from "next";
import { RiScissorsFill, RiErrorWarningLine } from "react-icons/ri";
import Link from "next/link";

export const metadata: Metadata = {
  title: "JR分割乗車券計算機",
  description: "JR在来線の分割乗車券を自動計算。発駅と着駅を入力するだけで、最も安くなる分割パターンと節約額を表示します。独自の経路探索アルゴリズムにより、あらゆる組み合わせから最安値を導出します。",
  alternates: {
    canonical: "/split",
  },
};

export default async function SplitPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const params = await searchParams;
  const from = typeof params.from === "string" ? params.from : undefined;
  const to = typeof params.to === "string" ? params.to : undefined;
  const searchType = "ticket";

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'JR分割乗車券計算機',
    description: 'JR在来線の分割乗車券を自動計算。発駅と着駅を入力するだけで、最も安くなる分割パターンと節約額を表示します。',
    url: 'https://kippu-navi.com/split',
    applicationCategory: 'UtilityApplication',
    operatingSystem: 'All',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'JPY',
    },
    author: {
      '@type': 'Person',
      name: 'きっぷナビ運営者',
      url: 'https://kippu-navi.com/about',
    },
  };

  const faqJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: [
      {
        '@type': 'Question',
        name: '分割きっぷとは何ですか？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'JRの乗車券を途中駅で分割して購入することで、通しで購入するよりも安くなる場合があります。この仕組みを利用した乗車券のことを一般的に「分割きっぷ」と呼びます。',
        },
      },
      {
        '@type': 'Question',
        name: '分割した乗車券はどこで購入できますか？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'えきねっとやe5489などのインターネット予約サービス、または指定席券売機やみどりの窓口で購入できます。ただし、他駅発の乗車券は駅の券売機では購入できない場合があります。',
        },
      },
      {
        '@type': 'Question',
        name: '分割きっぷは違法ですか？',
        acceptedAnswer: {
          '@type': 'Answer',
          text: 'いいえ、違法ではありません。旅客営業規則第157条にも、2枚以上のきっぷを併用して使用することが想定された条文が存在します。',
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <div className="py-12 px-4 sm:px-6 lg:px-8">
        <main className="max-w-xl mx-auto">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center p-4 bg-blue-100 rounded-full mb-4 shadow-sm">
              <RiScissorsFill className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mb-3">
              {"JR分割乗車券計算機"}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 min-h-20">
              {"乗車する区間の「発駅」と「着駅」を入力してください。"}
              <br className="hidden sm:block" />
              {"最安となるパターンを自動で導出します。"}
            </p>
          </div>
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3 shadow-sm">
            <RiErrorWarningLine className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-amber-800 leading-relaxed">
              <span className="font-bold block mb-1">【お知らせ】長距離区間の計算制限について</span>
              <p>
                システム負荷軽減のため、<strong>発着駅間の駅数が100を超える場合</strong>{"は計算を制限することがあります。"}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-10 rounded-2xl shadow-sm border border-slate-200">
            <Form
              initialFrom={from}
              initialTo={to}
              initialSearchType={searchType}
            />
          </div>

          {/* ツール説明セクション */}
          <div className="mt-12 space-y-8">

            {/* このツールでできること */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"このツールでできること"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <p>
                  {"JR分割乗車券計算機は、JR在来線の乗車券を途中の駅で分割して購入した場合に、通しで購入するよりも安くなるかどうかを自動計算するツールです。"}
                </p>
                <p>
                  {"独自の経路探索アルゴリズムにより、発駅から着駅までの全候補駅を高速に走査し、「最安分割パターン」を自動で導出します。経路の指定は不要で、発駅と着駅を入力するだけで結果が得られます。"}
                </p>
                <ul className="list-disc list-inside space-y-1.5 ml-2 text-slate-600">
                  <li>通し購入と分割購入の運賃を比較し、<strong>節約額をひと目で確認</strong></li>
                  <li>分割駅と各区間の運賃を視覚的に表示</li>
                  <li>複数の分割パターンがある場合は<strong>すべてのパターンを列挙</strong></li>
                  <li>経由する路線・駅リストも確認可能</li>
                </ul>
              </div>
            </section>

            {/* 使い方 */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"使い方"}
              </h2>
              <div className="text-slate-700 leading-relaxed space-y-3 text-sm">
                <ol className="list-decimal list-inside space-y-2 ml-2">
                  <li><strong>発駅を入力</strong> — 検索ボックスに出発駅を入力し、候補から選択します。</li>
                  <li><strong>着駅を入力</strong> — 同様に到着駅を入力し、候補から選択します。</li>
                  <li><strong>計算ボタンをクリック</strong> — 最安分割パターンの計算が開始されます。</li>
                  <li><strong>結果を確認</strong> — 通し購入と分割購入の運賃比較、分割駅、節約額が表示されます。</li>
                </ol>
                <p className="text-slate-500 text-xs mt-2">
                  {"※詳しい操作方法や購入手順については"}
                  <Link href="/guide" className="text-blue-600 hover:underline underline-offset-2 mx-1">
                    {"使い方ガイド"}
                  </Link>
                  {"をご覧ください。"}
                </p>
              </div>
            </section>

            {/* よくある質問 */}
            <section className="bg-white p-6 sm:p-8 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-bold text-slate-800 mb-4 border-b pb-2">
                {"よくある質問"}
              </h2>
              <div className="space-y-4 text-sm">
                <details className="group border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <summary className="flex justify-between items-center font-bold cursor-pointer list-none text-slate-800">
                    <span>分割きっぷとは何ですか？</span>
                    <span className="transition-transform duration-200 group-open:rotate-180 text-slate-500">
                      <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" className="w-5 h-5"><path d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                  </summary>
                  <div className="text-slate-700 mt-3 text-sm leading-relaxed border-t border-slate-100 pt-3">
                    <p>JRの乗車券を途中駅で分割して購入することで、通しで購入するよりも安くなる場合があります。この仕組みを利用した乗車券のことを一般的に「分割きっぷ」と呼びます。運賃のキロ単価や特定区間運賃の存在により、分割した方が安価になるケースが存在します。</p>
                  </div>
                </details>
                <details className="group border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <summary className="flex justify-between items-center font-bold cursor-pointer list-none text-slate-800">
                    <span>分割した乗車券はどこで購入できますか？</span>
                    <span className="transition-transform duration-200 group-open:rotate-180 text-slate-500">
                      <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" className="w-5 h-5"><path d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                  </summary>
                  <div className="text-slate-700 mt-3 text-sm leading-relaxed border-t border-slate-100 pt-3">
                    <p>
                      {"えきねっとやe5489などのインターネット予約サービス、または指定席券売機やみどりの窓口で購入できます。ただし、他駅発の乗車券は駅の券売機では購入できない場合があります。詳しくは"}
                      <Link href="/guide" className="text-blue-600 hover:underline underline-offset-2 mx-1">使い方ガイド</Link>
                      {"をご覧ください。"}
                    </p>
                  </div>
                </details>
                <details className="group border border-slate-200 rounded-xl p-4 bg-slate-50/50">
                  <summary className="flex justify-between items-center font-bold cursor-pointer list-none text-slate-800">
                    <span>分割きっぷは違法ではありませんか？</span>
                    <span className="transition-transform duration-200 group-open:rotate-180 text-slate-500">
                      <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24" className="w-5 h-5"><path d="M19 9l-7 7-7-7"></path></svg>
                    </span>
                  </summary>
                  <div className="text-slate-700 mt-3 text-sm leading-relaxed border-t border-slate-100 pt-3">
                    <p>いいえ、全く問題ありません。旅客営業規則第157条にも、2枚以上のきっぷを併用して使用することが想定された条文が存在します。</p>
                  </div>
                </details>
              </div>
            </section>

          </div>
        </main>
      </div>
    </>
  );
}
