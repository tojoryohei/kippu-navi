export type ChangelogItem = {
    date: string;
    tag: "お知らせ" | "アップデート" | "修正";
    content: string;
};

export const changelogData: ChangelogItem[] = [
    {
        date: "2026.04.18",
        tag: "修正",
        content: "v1.0.2 旅客営業取扱基準規程 第114条適用の足切り閾値を適正化し、特定の距離帯における適用漏れを解消しました。",
    },
    {
        date: "2026.04.13",
        tag: "お知らせ",
        content: "v1.0.1 よくある質問（FAQ）のセクションを追加しました。",
    },
    {
        date: "2026.04.13",
        tag: "お知らせ",
        content: "v1.0.0 公式版リリース",
    },
    {
        date: "2026.03.14",
        tag: "アップデート",
        content: "JR東日本の運賃改定に対応。",
    },
    {
        date: "2025.11.08",
        tag: "お知らせ",
        content: "分割乗車券プログラムの完成。",
    },
    {
        date: "2025.08.23",
        tag: "お知らせ",
        content: "きっぷナビのベータ版を公開しました。",
    },
];