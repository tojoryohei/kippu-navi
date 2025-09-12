import Link from 'next/link'

export default function Home() {

  return (
    <div className="bg-white p-6">
      <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
        <p>きっぷナビへようこそ！</p>
      </h1>
      <p className="py-4">
        アクセスしていただきありがとうございます。<br />
        このサイトでは「発駅」と「着駅」をから最適な分割乗車券の出力ができるプログラムを公開する予定です。<br />
        分割乗車券プログラムを作るにあたって必要となる運賃計算プログラムは現在作成中です。<br />
        以下のリンクから色々いじってみてください。
      </p>

      <Link href="/mr">運賃計算のページはこちら</Link>
    </div>
  );
}
