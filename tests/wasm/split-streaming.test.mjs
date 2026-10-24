/* eslint-disable security/detect-non-literal-fs-filename -- リポジトリ内のビルド資材だけを参照する。 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

// prepare-local-engine後に実行し、WASM・グラフ・Goランタイムのビルドを揃える。
const assets = new URL('../../public/engine/', import.meta.url);
await import(new URL('wasm_exec.js', assets).href);
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(readFileSync(new URL('main.wasm', assets)), go.importObject);
go.run(instance);
for (const capability of ['Ticket', 'Pass']) {
  const bytes = readFileSync(new URL(`${capability.toLowerCase()}_graph_data.bin`, assets));
  const ptr = globalThis[`prepare${capability}GraphBuffer`](bytes.length);
  new Uint8Array(instance.exports.mem.buffer).set(bytes, ptr);
  assert.ok(globalThis[`init${capability}GraphFromBuffer`](bytes.length));
}
const sorted = plans => plans.map(plan => JSON.stringify(plan)).sort();
function check(invoke) {
  const collected = JSON.parse(invoke());
  assert.equal(collected.error, undefined);
  const chunks = [];
  const completion = JSON.parse(invoke(json => chunks.push(JSON.parse(json))));
  assert.equal(completion.error, undefined);
  assert.equal(completion.streamed, true);
  const expected = collected.data || collected;
  const actual = chunks.flatMap(chunk => chunk.results);
  assert.deepEqual(sorted(actual), sorted(expected.results));
  assert.deepEqual(chunks[0].normal, expected.normal);
  assert.equal(new Set(actual.map(p => p.totalFare ?? p.totalAmount)).size, 1);
}

test('オフラインの乗車券・定期券・IC定期券で逐次結果と全件結果が一致する', () => {
  for (const [maxSplits, forbidden] of [[0,[]],[1,[]],[0,['赤羽']]]) {
    check(callback => globalThis.calculateOptimalSplitTicket('東京','大宮',maxSplits,JSON.stringify(forbidden),callback));
  }
  for (const [isIc, months] of [[false, 1], [true, 6]]) {
      const request = JSON.stringify({from:'新茂原',to:'茂原',months,isIc});
      const paths = JSON.parse(globalThis.calculateOptimalSplitPass(request)).results;
      const expected = paths.flatMap(path => JSON.parse(globalThis.reconstructAndCalculate(JSON.stringify(path),months,isIc)).results);
      const chunks=[];
      const terminal=JSON.parse(globalThis.calculateOptimalSplitPass(request,json=>chunks.push(JSON.parse(json))));
      assert.equal(terminal.streamed,true);
      assert.deepEqual(sorted(chunks.flatMap(c=>c.results)),sorted(expected));
  }
});

test('オンラインの詳細復元で乗車券・定期券・IC定期券の全解が一致する', () => {
  check(callback => globalThis.reconstructAndCalculateTicket(JSON.stringify(['東京','大宮']),callback));
  for(const isIc of [false,true]) check(callback => globalThis.reconstructAndCalculate(JSON.stringify(['新茂原','茂原']),1,isIc,callback));
});

test('分割前運賃の失敗で両自動計算を途中通知前に終了する', () => {
 const expected = '指定された区間はJR在来線のみで繋がっていません。経路入力検索を利用してください。';
 const callbacks = [];
 const callback = json => callbacks.push(JSON.parse(json));
 // 分割を先に計算すると、重複した始点で別のエラーになる。
 const splitPath = JSON.stringify(['稚内','稚内','青森']);
 for (const invoke of [
  cb => globalThis.calculateOptimalSplitTicket('稚内','青森',0,'[]',cb),
  cb => globalThis.reconstructAndCalculateTicket(splitPath,cb),
  cb => globalThis.calculateOptimalSplitPass(JSON.stringify({from:'稚内',to:'青森',months:1,isIc:false}),cb),
  cb => globalThis.reconstructAndCalculate(splitPath,1,false,cb),
 ]) {
  for (const cb of [undefined,callback]) {
   const response = JSON.parse(invoke(cb));
   assert.equal(response.error,expected);
   assert.equal(response.results,undefined);
  }
 }
 assert.deepEqual(callbacks,[]);
});
