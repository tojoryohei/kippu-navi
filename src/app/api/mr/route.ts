import { generateKippu } from '@/app/mr/lib/generateKippu';
import { NextResponse } from 'next/server';

import { RouteRequest } from '@/app/types';

export async function POST(request: Request) {
    const startTime = performance.now();
    try {
        const body: RouteRequest = await request.json();

        if (3000 <= body.fullPath.length) {
            const endTime = performance.now();
            const calculationTimeMs = endTime - startTime;
            return NextResponse.json(
                {
                    error: '経由路線の上限は3000です。',
                    time: calculationTimeMs
                },
                { status: 400 }
            );
        }

        const stations = new Set(body.fullPath.map((path) => path.stationName));
        if (!body.fullPath || body.fullPath.length < 2 || stations.size === 1) {
            const endTime = performance.now();
            const calculationTimeMs = endTime - startTime;
            return NextResponse.json(
                {
                    error: '経路がありません。',
                    time: calculationTimeMs
                },
                { status: 400 }
            );
        }

        const result = generateKippu(body, {
            calculationMode: body.calculationMode
        });

        const endTime = performance.now();
        const calculationTimeMs = endTime - startTime;
        return NextResponse.json(
            {
                data: result,
                time: calculationTimeMs
            },
            { status: 200 }
        );

    } catch (error) {
        const endTime = performance.now();
        const calculationTimeMs = endTime - startTime;

        const errorMessage = (error instanceof Error) ? error.message : '予期せぬエラーが起きました';
        const status = errorMessage === '経路が重複しています。' ? 400 : 500;

        return NextResponse.json(
            {
                error: errorMessage,
                time: calculationTimeMs
            },
            { status }
        );
    }
}
