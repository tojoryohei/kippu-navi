import { NextRequest, NextResponse } from 'next/server';
import { getOptimalSplitWithCache } from '@/app/split/lib/getOptimalSplitWithCache';

import { SplitApiRequest } from '@/app/types';
import { StationCountLimitExceededError, RouteNotFoundError } from '@/app/utils/errors';

export async function POST(request: NextRequest) {
    let startStationName: string | undefined;
    let endStationName: string | undefined;
    const startTime = performance.now();
    try {
        const body: SplitApiRequest = await request.json();

        startStationName = body.startStationName;
        endStationName = body.endStationName;

        // 1. バリデーション
        if (!startStationName || !endStationName) {
            return NextResponse.json({ error: '出発駅と到着駅は必須です。' }, { status: 400 });
        }

        if (startStationName === endStationName) {
            return NextResponse.json({ error: '出発駅と到着駅が同じです。' }, { status: 400 });
        }

        // 2. 最適分割経路の計算（キャッシュから取得、または新規計算してキャッシュへ保存）
        const result = await getOptimalSplitWithCache(startStationName, endStationName);

        // 3. レスポンスの返却
        const endTime = performance.now();
        const calculationTimeMs = endTime - startTime;

        return NextResponse.json(
            {
                data: result,
                time: calculationTimeMs
            },
            { status: 200 }
        );

    } catch (error: unknown) {
        const safeStart = startStationName ?? '不明';
        const safeEnd = endStationName ?? '不明';

        if (error instanceof StationCountLimitExceededError) {
            console.warn(`[API/StationCountLimit]: ${error.message} (Request: ${safeStart} -> ${safeEnd})`);
            return NextResponse.json({ error: error.message }, { status: 422 });
        }

        if (error instanceof RouteNotFoundError) {
            console.info(`[API/NotFound]: ${error.message} (Request: ${safeStart} -> ${safeEnd})`);
            return NextResponse.json({ error: error.message }, { status: 404 });
        }

        console.error('[API/Split Route Error]:', error);
        return NextResponse.json(
            { error: 'サーバー内部でエラーが発生しました。' },
            { status: 500 }
        );
    }
}
