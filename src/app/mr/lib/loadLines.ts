import fs from 'fs';
import path from 'path';

import { Line } from '@/app/types';

class LoadLines {
    private lines: Map<string, Line> = new Map();

    constructor () {
        this.loadLines();
    }

    private loadLines() {
        try {

            // lines.jsonの読み込み
            const linesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'lines.json');
            const linesData: Line[] = JSON.parse(fs.readFileSync(linesPath, 'utf-8'));
            for (const line of linesData) {
                this.lines.set(line.name, line);
            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getLineByName(name: string): Line {
        const line = this.lines.get(name);
        if (line === undefined) {
            throw new Error(` ${name} が見つかりません.`);
        }
        return line;
    }
}

export const loadLines = new LoadLines();