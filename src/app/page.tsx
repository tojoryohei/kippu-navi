import Link from 'next/link'

export const metadata = {
  title: "きっぷナビ",
};

export default function Home() {

  return (
    <div className="bg-white p-6">
      <main className="max-w-md mx-auto">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          <p>きっぷナビへようこそ！</p>
        </h1>
        <p className="py-4">
          アクセスしていただきありがとうございます．<br />
          このサイトでは「発駅」と「着駅」をから最適な分割乗車券の出力ができるプログラムを公開しています．<br />
          また，分割乗車券プログラムを作るにあたって必要となる運賃計算プログラムも公開しています．<br />
          以下のリンクからどうぞ．<br />
        </p>
        <Link href="/mr" className="text-blue-600 hover:underline cursor-pointer">運賃計算プログラム</Link>
        <br />
        <Link href="/split" className="text-blue-600 hover:underline cursor-pointer">分割運賃プログラム</Link>
      </main>
    </div>
  );
}
