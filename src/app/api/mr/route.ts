import { NextResponse } from 'next/server';
import { processRouteAndCalculateFare } from '@/app/mr/lib/generateTicket';

import { RouteRequest } from '@/app/types';

export async function POST(request: Request) {
    const startTime = performance.now();
    try {
        const body: RouteRequest = await request.json();

        if (100 < body.path.length) {
            const endTime = performance.now();
            const calculationTimeMs = endTime - startTime;
            return NextResponse.json(
                {
                    error: '経路の上限は100です．',
                    time: calculationTimeMs
                },
                { status: 400 }
            );
        }

        let stations = new Set<string>();
        for (let i = 0; i < body.path.length; i++) {
            stations.add(body.path[i].stationName);
        }
        if (!body.path || body.path.length < 2 || stations.size === 1) {
            const endTime = performance.now();
            const calculationTimeMs = endTime - startTime;
            return NextResponse.json(
                {
                    error: '不正な経路です',
                    time: calculationTimeMs
                },
                { status: 400 }
            );
        }
        const result = processRouteAndCalculateFare(body);
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

        return NextResponse.json(
            {
                error: errorMessage,
                serverCalculationTimeMs: calculationTimeMs
            },
            { status: 500 }
        );
    }
}