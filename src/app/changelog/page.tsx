import { getChangelogs } from '@/app/lib/changelog';

export const metadata = {
    title: "更新履歴",
    description: "きっぷナビのシステムアップデートや新機能の追加、お知らせなどの更新履歴を掲載しています。",
};

// サーバーコンポーネントとして定義
export default async function ChangelogPage() {
    // 全件取得
    const changelogData = await getChangelogs();

    return (
        <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">

            {/* ページヘッダー */}
            <div className="text-center space-y-4 mb-10">
                <h1 className="text-3xl font-bold text-slate-900 sm:text-4xl">
                    更新履歴
                </h1>
                <p className="text-slate-600">
                    システムのアップデート情報やお知らせを掲載しています。
                </p>

                <div className="pt-2">
                    <a
                        href="https://github.com/tojoryohei/kippu-navi/releases"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 px-4 py-2 rounded-full transition-colors"
                        title="GitHubで公式リリース一覧を確認する"
                    >
                        <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current" aria-hidden="true">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                        </svg>
                        GitHub Releases を見る
                    </a>
                </div>
            </div>

            {/* タイムラインコンテナ */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10">
                <div className="space-y-8">
                    {changelogData.length > 0 ? (
                        changelogData.map((item, index) => (
                            <div key={index} className="flex flex-col sm:flex-row sm:items-start border-b border-slate-100 pb-6 last:border-0 last:pb-0">

                                {/* 日付とタグ（左側） */}
                                <div className="flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 sm:w-40 shrink-0 mb-3 sm:mb-0">
                                    <time className="font-mono text-slate-600 font-medium">{item.date}</time>
                                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold w-fit
                      ${item.tag === 'アップデート' ? 'bg-blue-100 text-blue-700' :
                                            item.tag === '修正' ? 'bg-emerald-100 text-emerald-700' :
                                                'bg-slate-100 text-slate-700'}`}
                                    >
                                        {item.tag}
                                    </span>
                                </div>

                                {/* 内容（右側） */}
                                <div className="text-slate-700 sm:pt-0.5 leading-relaxed space-y-2">
                                    <div className="font-bold text-slate-800 flex items-center gap-2">
                                        {item.url ? (
                                            <a
                                                href={item.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline hover:text-blue-800 transition-colors"
                                                title="GitHubで確認する"
                                            >
                                                {item.version}
                                            </a>
                                        ) : (
                                            <span>{item.version}</span>
                                        )}
                                    </div>
                                    <ul className="list-disc list-outside ml-5 space-y-1.5 text-slate-600">
                                        {item.contents.map((text, i) => (
                                            <li key={i}>{text}</li>
                                        ))}
                                    </ul>
                                </div>

                            </div>
                        ))
                    ) : (
                        <p className="text-center text-slate-500">更新履歴はありません。</p>
                    )}
                </div>
            </div>

        </div>
    );
}
