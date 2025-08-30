import { loadMR } from '@/lib/loadMR';

import { Line, DetailedPathStep, RouteRequest, ApiResponse, PathStep } from '@/types';

class MRCalculator {
    public processRouteAndCalculateFare(request: RouteRequest): ApiResponse {
        const userInputPath = request.path;
        const detailedPath = this.reconstructPath(userInputPath);

        // 出発駅と到着駅の名前を取得して変数に代入
        let departureStation: string = detailedPath[0].station.name;
        let arrivalStation: string = detailedPath[detailedPath.length - 1].station.name;

        // ステップ1: 経路の補正
        const correctedPath = this.correctPath(userInputPath);

        // ステップ2: 営業キロと運賃の計算 (補正後の経路を使用)
        const totalEigyoKilo = this.calculateTotalEigyoKilo(correctedPath);
        const totalGiseiKilo = this.calculateTotalGiseiKilo(correctedPath);
        const fare = this.calculateFareFromKilo(totalGiseiKilo);
        const validDays = this.calculateValidDaysFromKilo(totalGiseiKilo);
        // ステップ3: 経由文字列の生成 (ユーザー入力の経路を使用)
        const via = this.generateViaString(userInputPath);

        // ステップ4: 計算結果を返す
        return {
            totalEigyoKilo,
            totalGiseiKilo,
            departureStation,
            arrivalStation,
            fare,
            via,
            validDays
        };
    }

    private reconstructPath(path: PathStep[]): DetailedPathStep[] {
        const detailedPath: DetailedPathStep[] = [];

        for (const step of path) {
            const station = loadMR.getStationByName(step.stationName);
            if (!station) {
                throw new Error(`駅が見つかりません: Name ${step.stationName}`);
            }

            let lineToNext: Line | null = null;
            if (step.lineName !== null) {
                const line = loadMR.getLineByName(step.lineName);
                if (!line) {
                    throw new Error(`路線が見つかりません: Name ${step.lineName}`);
                }
                lineToNext = line;
            }

            detailedPath.push({ station, lineToNext });
        }
        return detailedPath;
    }
    private correctPath(path: PathStep[]): PathStep[] {
        return path;
    }

    private calculateTotalEigyoKilo(path: PathStep[]): number {
        let total: number = 11;
        return total;
    }

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let total: number = 1900;
        return total;
    }

    private calculateFareFromKilo(GiseiKilo: number): number {
        let total: number = 0;
        return total;
    }

    private generateViaString(path: PathStep[]): string[] {
        return [];
    }

    private calculateValidDaysFromKilo(totalGiseiKilo: number): number {
        return Math.ceil(totalGiseiKilo / 2000) + 1;
    }
}

export const calcMR = new MRCalculator();