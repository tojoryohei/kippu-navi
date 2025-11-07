import { NextRequest, NextResponse } from 'next/server';
import { calcSplit } from '@/app/split/lib/calcSplit';

import { SplitApiRequest } from '@/app/types';

export async function POST(request: NextRequest) {
    const startTime = performance.now();
    try {
        const body: SplitApiRequest = await request.json();

        const { startStationName, endStationName } = body;

        if (!startStationName || !endStationName) {
            return NextResponse.json({ error: '出発駅と到着駅は必須です。' }, { status: 400 });
        }

        if (startStationName === endStationName) {
            return NextResponse.json({ error: '出発駅と到着駅が同じです。' }, { status: 400 });
        }

        const result = calcSplit.findCheapestRoute(startStationName, endStationName);

        if (!result || result.totalFare === Infinity) {
            return NextResponse.json({ error: '経路が見つかりませんでした。' }, { status: 404 });
        }

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
        console.error(error);
        return NextResponse.json(error.message, { status: 500 });
    }
}