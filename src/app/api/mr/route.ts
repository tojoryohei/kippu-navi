import { NextResponse } from 'next/server';
import { calc } from '@/app/mr/lib/calc';

import { RouteRequest } from '@/app/mr/types';

export async function POST(request: Request) {
    try {
        const body: RouteRequest = await request.json();

        if (!body.path || body.path.length < 2) {
            return NextResponse.json({ error: '不正な経路です' }, { status: 400 });
        }
        if (100 < body.path.length) {
            return NextResponse.json({ error: '経路が長すぎます' }, { status: 400 });
        }
        const result = calc.processRouteAndCalculateFare(body);
        return NextResponse.json(result, { status: 200 });

    } catch (error) {
        console.error('計算エラー', error);
        return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
    }
}