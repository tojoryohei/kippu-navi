'use client';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 静的ファイルのバージョン乖離および Server Action 未検出エラーを検知
  const isVersionSkew =
    error.name === 'ChunkLoadError' ||
    /Loading chunk .* failed/.test(error.message) ||
    error.message?.includes('Load failed') ||
    error.message?.includes('Server Action') ||
    error.message?.includes('was not found on the server');

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center max-w-md mx-auto space-y-6">
      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          {isVersionSkew ? '新しいバージョンが利用可能です' : 'エラーが発生しました'}
        </h2>
        <p className="text-slate-600 leading-relaxed text-sm">
          {isVersionSkew
            ? 'アプリの更新が行われたため、最新のデータを読み込む必要があります。'
            : '一時的なエラーが発生しました。時間を置いて再度お試しいただくか、ページを再読み込みしてください。'}
        </p>
      </div>
      <div className="pt-2">
        <button
          onClick={() => {
            if (isVersionSkew) {
              window.location.reload();
            } else {
              reset();
            }
          }}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-md transition-all cursor-pointer hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0 duration-200"
        >
          {isVersionSkew ? '再読み込みしてください' : 'もう一度試す'}
        </button>
      </div>
    </div>
  );
}
