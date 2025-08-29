import { loadMR } from '@/lib/loadMR';

import { RouteRequest, ApiResponse, PathStep } from '@/types';

class FareCalculator {
    public processRouteAndCalculateFare(request: RouteRequest): ApiResponse {
        const userInputPath = request.path;
        var departureStation: string = "鹿島";
        var arrivalStation: string = "鹿島サッカースタジアム";

        // ステップ1: 経路の補正
        const correctedPath = this.correctPath(userInputPath);

        // ステップ2: 営業キロと運賃の計算 (補正後の経路を使用)
        const totalEigyoKilo = this.calculateTotalEigyoKilo(correctedPath);
        const totalGiseiKilo = this.calculateTotalGiseiKilo(correctedPath);
        const fare = this.calculateFareFromKilo(totalGiseiKilo);
        const validDays = 2;
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

    private correctPath(path: PathStep[]): PathStep[] {
        // TODO: 大都市近郊区間などのルールに基づき、運賃計算用の最短経路を返すロジック
        return path;
    }

    private calculateTotalEigyoKilo(path: PathStep[]): number {
        let total = 0;
        return 12.3; // 仮の値
    }

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let total = 0;
        return 12.3; // 仮の値
    }

    private calculateFareFromKilo(GiseiKilo: number): number {
        return 210; // 仮の値
    }

    private generateViaString(path: PathStep[]): string[] {
        return ["札沼", "石勝"]; // 仮の値
    }
}

// シングルトンインスタンスとしてエクスポート
export const calcFare = new FareCalculator();