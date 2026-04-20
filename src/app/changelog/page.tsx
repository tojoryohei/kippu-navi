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