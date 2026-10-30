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
