export const metadata = {
  title: "お問い合わせ",
  description: "きっぷナビへのご意見、ご質問、不具合のご報告などはこちらのお問い合わせフォームからご連絡ください。",
};

export default function ContactPage() {
  return (
    <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8 flex flex-col min-h-screen">

      {/* ページヘッダー */}
      <div className="text-center space-y-4">
        <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
          お問い合わせ
        </h1>
        <p className="text-slate-600 max-w-2xl mx-auto leading-relaxed">
          きっぷナビをご利用いただきありがとうございます。
          <br className="hidden sm:block" />
          サービスに関するご質問、不具合のご報告、その他ご意見がございましたら、以下のフォームよりお気軽にご連絡ください。
        </p>
      </div>

      {/* フォームコンテナ（白背景のカード風） */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden w-full flex justify-center py-8">
        <iframe
          src="https://docs.google.com/forms/d/e/1FAIpQLSf-1iMQuMkZb0m8MRvWAKFwvtYfL9CiddOSbXE54xzAH59LPw/viewform?embedded=true"
          width="100%"
          height="800"
          frameBorder="0"
          marginHeight={0}
          marginWidth={0}
          title="お問い合わせフォーム"
          className="max-w-160"
        >
          読み込んでいます…
        </iframe>
      </div>

    </div>
  );
}