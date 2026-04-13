import { NextRequest, NextResponse } from 'next/server';
import { getOptimalSplitWithCache } from '@/app/utils/getOptimalSplitWithCache';

import { SplitApiRequest } from '@/app/types';

export async function POST(request: NextRequest) {
    const startTime = performance.now();
    try {
        const body: SplitApiRequest = await request.json();

        const { startStationName, endStationName } = body;

        // 1. バリデーション
        if (!startStationName || !endStationName) {
            return NextResponse.json({ error: '出発駅と到着駅は必須です。' }, { status: 400 });
        }

        if (startStationName === endStationName) {
            return NextResponse.json({ error: '出発駅と到着駅が同じです。' }, { status: 400 });
        }

        // 2. 最適分割経路の計算（キャッシュから取得、または新規計算してキャッシュへ保存）
        const result = await getOptimalSplitWithCache(startStationName, endStationName);

        // 3. 結果の判定
        if (result === null || result.shortestData.fare === Infinity) {
            return NextResponse.json({ error: '経路が見つかりませんでした。' }, { status: 404 });
        }

        // 4. レスポンスの返却
        const endTime = performance.now();
        const calculationTimeMs = endTime - startTime;

        return NextResponse.json(
            {
                data: result,
                time: calculationTimeMs
            },
            { status: 200 }
        );

    } catch (error: any) {
        // 予期せぬエラーのログ出力と、クライアントへの安全なエラーメッセージ返却
        console.error('[API/Split Route Error]:', error);
        return NextResponse.json(
            { error: 'サーバー内部でエラーが発生しました。' },
            { status: 500 }
        );
    }
}