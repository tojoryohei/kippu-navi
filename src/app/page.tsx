import Link from 'next/link'

export default function Home() {

  return (
    <div className="min-h-screen">
      <main className="max-w-xl bg-white p-6">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          <p>きっぷナビへようこそ！</p>
        </h1>
        <Link href="/mr">運賃計算のページはこちら</Link>
      </main>
    </div>
  );
}
