import fs from 'fs';
import path from 'path';

export interface ChangelogItem {
    date: string;
    version: string;
    url?: string;
    tag: 'アップデート' | '修正' | 'お知らせ';
    contents: string[];
}

export async function getChangelogs(limit?: number): Promise<ChangelogItem[]> {
    try {
        const filePath = path.join(process.cwd(), 'CHANGELOG.md');
        if (!fs.existsSync(filePath)) return [];

        const fileContent = fs.readFileSync(filePath, 'utf8');
        // ヘッダー(# Changelog)を飛ばして、バージョンごとに分割
        const sections = fileContent.split('\n## [').slice(1);

        const logs = sections.map((section) => {
            const lines = section.split('\n');
            // 例: "1.1.1](https://github.com/...) (2026-04-19)"
            const headerLine = lines[0];

            // バージョン、URL、日付を正規表現で抽出
            const versionMatch = headerLine.match(/^([^\]]+)\]/);
            const urlMatch = headerLine.match(/\]\(([^)]+)\)/); // ]( と ) の間を抽出
            const dateMatch = headerLine.match(/(\d{4}-\d{2}-\d{2})/);

            const version = versionMatch ? `v${versionMatch[1]}` : 'Unknown';
            const url = urlMatch ? urlMatch[1] : undefined; // GitHubの差分URL
            const date = dateMatch ? dateMatch[1].replace(/-/g, '.') : '';

            // タグの判定
            let tag: 'アップデート' | '修正' | 'お知らせ' = 'お知らせ';
            if (section.includes('### Bug Fixes')) tag = '修正';
            else if (section.includes('### Features')) tag = 'アップデート';

            const contents = lines
                .filter(line => line.trim().startsWith('*') || line.trim().startsWith('-'))
                .map(line => {
                    // 1. 先にtrim()して見えない改行コード(\r)や前後の空白を確実に除去
                    let text = line.trim().replace(/^[\*\-]\s+/, '');
                    text = text.replace(/\*\*/g, ''); // 太字の ** を削除

                    // 2. 行末の Issueリンク、コミットハッシュリンク、closes 等をまとめて削除
                    // ※ [#32] や [c29b834] のような Issue番号・コミットハッシュの形式のみを対象としています
                    // eslint-disable-next-line security/detect-unsafe-regex
                    text = text.replace(/(?:\s*(?:,?\s*closes\s*)?\(?\[(?:#[0-9]+|[a-f0-9]+)\]\([^)]+\)\)?)+$/i, '');

                    return text.trim();
                });

            if (contents.length === 0) {
                contents.push('システムの最適化および機能の更新を行いました。');
            }

            return { date, version, url, tag, contents };
        });

        return limit ? logs.slice(0, limit) : logs;
    } catch (error) {
        console.error('Error parsing CHANGELOG.md:', error);
        return [];
    }
}
