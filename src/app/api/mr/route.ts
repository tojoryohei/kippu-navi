import { generateKippu, createFullPath } from '@/app/mr/lib/generateKippu';
import { NextResponse } from 'next/server';

import { RouteRequest } from '@/app/types';

export async function POST(request: Request) {
    const startTime = performance.now();
    try {
        const body: RouteRequest = await request.json();

        if (300 <= body.path.length) {
            const endTime = performance.now();
            const calculationTimeMs = endTime - startTime;
            return NextResponse.json(
                {
                    error: '経由路線の上限は300です。',
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
                    error: '不正な経路です。',
                    time: calculationTimeMs
                },
                { status: 400 }
            );
        }

        const isPass = body.searchType && body.searchType !== "ticket";
        if (isPass) {
            const TEMPORARY_STATIONS = [
                "原生花園",
                "ラベンダー畑",
                "細岡",
                "猪苗代湖畔",
                "ガーラ湯沢",
                "偕楽園",
                "鹿島サッカースタジアム",
                "津島ノ宮",
                "田井ノ浜",
                "バルーンさが"
            ];
            const startName = body.path[0].stationName;
            const endName = body.path[body.path.length - 1].stationName;
            if (TEMPORARY_STATIONS.includes(startName) || TEMPORARY_STATIONS.includes(endName)) {
                const endTime = performance.now();
                const calculationTimeMs = endTime - startTime;
                return NextResponse.json(
                    {
                        error: '臨時駅発着の定期券は計算できません',
                        time: calculationTimeMs
                    },
                    { status: 400 }
                );
            }

            const fullPath = createFullPath(body.path);
            const stationNames = fullPath.map(p => p.stationName).filter(name => !TEMPORARY_STATIONS.includes(name));
            const firstPart = stationNames.slice(0, -1);
            const hasDuplicateInFirstPart = firstPart.some((name, index) => firstPart.indexOf(name) !== index);
            if (hasDuplicateInFirstPart) {
                const endTime = performance.now();
                const calculationTimeMs = endTime - startTime;
                return NextResponse.json(
                    {
                        error: '経路が重複しています。',
                        time: calculationTimeMs
                    },
                    { status: 400 }
                );
            }

            const endTime = performance.now();
            const calculationTimeMs = endTime - startTime;
            return NextResponse.json(
                {
                    data: {
                        correctedPath: stationNames
                    },
                    time: calculationTimeMs
                },
                { status: 200 }
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
