import Link from 'next/link'

export default function Home() {

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <main className="max-w-xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          <p>きっぷナビへようこそ！</p>
        </h1>
        <Link href="/mr">運賃計算のページはこちら</Link>
      </main>
    </div>
  );
}
