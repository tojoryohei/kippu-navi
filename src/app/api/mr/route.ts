import { NextResponse } from 'next/server';
import { calc } from '@/app/mr/lib/calc';

import { RouteRequest } from '@/app/mr/types';

export async function POST(request: Request) {
    try {
        const body: RouteRequest = await request.json();

        if (100 < body.path.length) {
            return NextResponse.json({ error: '経路が長すぎます' }, { status: 400 });
        }
        let stations = new Set<string>();
        for (let i = 0; i < body.path.length; i++) {
            stations.add(body.path[i].stationName);
        }
        if (!body.path || body.path.length < 2 || stations.size === 1) {
            return NextResponse.json({ error: '不正な経路です' }, { status: 400 });
        }
        const result = calc.processRouteAndCalculateFare(body);
        return NextResponse.json(result, { status: 200 });

    } catch (error) {
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
}