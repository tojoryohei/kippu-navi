/* eslint-disable security/detect-non-literal-fs-filename -- ビルド済みのローカルWASMとグラフだけを読む。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

const assets = new URL('../../public/engine/', import.meta.url);
await import(new URL('wasm_exec.js', assets).href);
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(readFileSync(new URL('main.wasm', assets)), go.importObject);
go.run(instance);
const bytes = readFileSync(new URL('ticket_graph_data.bin', assets));
const ptr = globalThis.prepareTicketGraphBuffer(bytes.length);
new Uint8Array(instance.exports.mem.buffer).set(bytes, ptr);
assert.ok(globalThis.initTicketGraphFromBuffer(bytes.length));
const tokai = ['東京','品川','新横浜','小田原','熱海'];
function calculate(stations, options = {}) {
    return JSON.parse(globalThis.calculateRouteTicket(JSON.stringify({ fullPath: stations.map(stationName => ({ stationName, lineName: 'シンカ' })), calculationMode: 'normal', ...options })));
}

test('WASMの互換性、適用フラグ、未知値と小児不可割引', () => {
    const stations = tokai;
    const adult = calculate(stations);
    assert.equal(adult.error, undefined);
    assert.equal(adult.data.discountApplied, false);
    const student = calculate(stations, { discountId: 'student' });
    assert.equal(student.data.discountApplied, true);
    assert.equal(student.data.fare, Math.floor(adult.data.fare * 0.8 / 10) * 10);
    const child = calculate(stations, { passengerType: 'child', discountId: 'student' });
    assert.equal(child.data.discountApplied, false);
    assert.equal(child.data.fare, Math.floor(adult.data.fare / 20) * 10);
    assert.match(calculate(stations, { discountId: 'unknown' }).error, /不明な割引/);
    assert.match(calculate(stations, { passengerType: 'unknown' }).error, /不明な年齢区分/);
});

for (const mode of ['normal', 'cheapest', 'uncorrect']) {
    for (const [stations, originZone, destZone] of [
        [['東京', '品川', '新横浜', '小田原', '熱海'], '東京山手線内', null],
        [['東京', '品川', '新横浜', '小田原', '熱海', '三島', '（東）新富士', '静岡', '掛川', '浜松', '豊橋', '三河安城', '名古屋'], '東京都区内', '名古屋市内'],
        [['新大阪', '新神戸', '西明石', '姫路'], '大阪・新大阪', null],
    ]) {
        test(`単駅指定の発着別制御: ${stations[0]}→${stations.at(-1)} / ${mode}`, () => {
            for (const reverse of [false, true]) {
                const path = reverse ? [...stations].reverse() : stations;
                const zones = reverse ? [destZone, originZone] : [originZone, destZone];
                for (const departureSingleStation of [false, true]) {
                    for (const arrivalSingleStation of [false, true]) {
                        const result = calculate(path, { calculationMode: mode, departureSingleStation, arrivalSingleStation });
                        assert.equal(result.error, undefined);
                        const expected = [departureSingleStation ? path[0] : zones[0] ?? path[0], arrivalSingleStation ? path.at(-1) : zones[1] ?? path.at(-1)];
                        assert.deepEqual([result.data.departureStation, result.data.arrivalStation], expected);
                    }
                }
                // 同じ共有計算器への次のリクエストに指定を残さない。
                const baseline = calculate(path, { calculationMode: mode });
                assert.deepEqual([baseline.data.departureStation, baseline.data.arrivalStation], [zones[0] ?? path[0], zones[1] ?? path.at(-1)]);
            }
        });
    }
}
