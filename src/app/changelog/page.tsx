import { changelogData } from "@/app/data/changelogData";

export const metadata = {
    title: "更新履歴",
    description: "きっぷナビのシステムアップデートや新機能の追加、お知らせなどの更新履歴を掲載しています。",
};

export default function ChangelogPage() {
    return (
        <div className="py-12 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto space-y-8">

            {/* ページヘッダー */}
            <div className="text-center space-y-4 mb-8">
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
                    {changelogData.map((item, index) => (
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
                            <div className="text-slate-700 sm:pt-0.5 leading-relaxed">
                                {item.content}
                            </div>

                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}