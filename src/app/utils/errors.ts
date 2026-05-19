export class DistanceLimitExceededError extends Error {
    constructor (distance: number, limit: number) {
        super(`発着駅間の距離が上限の${limit}kmを超えています。`);
        this.name = 'DistanceLimitExceededError';
    }
}

export class RouteNotFoundError extends Error {
    constructor () {
        super('指定された区間の経路が見つかりませんでした。');
        this.name = 'RouteNotFoundError';
    }
}
