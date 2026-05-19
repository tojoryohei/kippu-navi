export class StationCountLimitExceededError extends Error {
    constructor (stationCount: number, limit: number) {
        super(`発着駅間の駅数が上限の${limit}を超えています。`);
        this.name = 'StationCountLimitExceededError';
    }
}

export class RouteNotFoundError extends Error {
    constructor () {
        super('指定された区間の経路が見つかりませんでした。');
        this.name = 'RouteNotFoundError';
    }
}
