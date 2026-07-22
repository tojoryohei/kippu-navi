import { promises as fs } from 'fs';
import path from 'path';

export interface ChangelogItem {
    date: string;
    version: string;
    url?: string;
    tag: '新機能' | 'バグ修正' | '最適化';
    contents: string[];
}

export async function getChangelogs(limit?: number): Promise<ChangelogItem[]> {
    try {
        const filePath = path.join(process.cwd(), 'CHANGELOG.md');
        let fileContent: string;
        try {
            fileContent = await fs.readFile(filePath, 'utf8');
        } catch (error: unknown) {
            if (error instanceof Error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
                return [];
            }
            throw error;
        }

        // ヘッダー(# Changelog)を飛ばして、バージョンごとに分割
        const sections = fileContent.split('\n## [').slice(1);

        const logs = sections.map((section) => {
            const lines = section.split('\n');
            const headerLine = lines[0];
            const versionMatch = headerLine.match(/^([^\]]+)\]/);
            const urlMatch = headerLine.match(/\]\(([^)]+)\)/);
            const dateMatch = headerLine.match(/(\d{4}-\d{2}-\d{2})/);

            const version = versionMatch ? `v${versionMatch[1]}` : 'Unknown';
            const url = urlMatch ? urlMatch[1] : undefined;
            const date = dateMatch ? dateMatch[1].replace(/-/g, '.') : '';

            let tag: '新機能' | 'バグ修正' | '最適化' = '最適化';
            if (section.includes('### Features')) {
                tag = '新機能';
            } else if (section.includes('### Bug Fixes')) {
                tag = 'バグ修正';
            }

            const contents = lines
                .filter(line => line.trim().startsWith('*') || line.trim().startsWith('-'))
                .map(line => {
                    let text = line.trim().replace(/^[\*\-]\s+/, '');
                    text = text.replace(/\*\*/g, '');
                    text = text.replace(/\[(?:#[0-9]+|[a-f0-9]+)\]\([^)]+\)/g, '');
                    text = text.replace(/closes[\s,()]*$/i, '');
                    text = text.replace(/[\s,()]+$/, '');
                    return text.trim();
                });

            if (contents.length === 0) {
                contents.push('システムの最適化および機能の更新を行いました。');
            }

            return { date, version, url, tag, contents };
        });

        return limit ? logs.slice(0, limit) : logs;
    } catch (error: unknown) {
        console.error('Error parsing CHANGELOG.md:', error);
        return [];
    }
}
