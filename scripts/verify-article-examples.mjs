// 掲載値は自動更新しない。更新前に公式資料を確認し、この検証で計算との差分を調べる。
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const data = JSON.parse(readFileSync(resolve(root, 'src/data/split-ticket-examples.json'), 'utf8'));
const version = readFileSync(resolve(root, '.cloudflare-engine/version.txt'), 'utf8').trim();
const directory = resolve(root, '.cloudflare-engine', version);
vm.runInThisContext(readFileSync(resolve(directory, 'wasm_exec.js'), 'utf8'));
const go = new globalThis.Go();
const { instance } = await WebAssembly.instantiate(readFileSync(resolve(directory, 'main.wasm')), go.importObject);
void go.run(instance);
const bytes = readFileSync(resolve(directory, 'ticket_graph_data.bin'));
const pointer = globalThis.prepareTicketGraphBuffer(bytes.length);
new Uint8Array(instance.exports.mem.buffer, pointer, bytes.length).set(bytes);
assert.equal(globalThis.initTicketGraphFromBuffer(), 'ok');
const normalize = result => ({
  total: result.totalAmount,
  segments: result.segments.map(segment => ({
    from: segment.start, to: segment.end, path: segment.path, via: segment.via,
    fare: segment.result.Fare, barrierFreeFee: segment.result.BarrierFreeFee,
    kilometers: segment.totalEigyoKilo / 10,
  })),
});
try {
  for (const example of data.examples) {
    const result = JSON.parse(globalThis.calculateOptimalSplitTicket(example.from, example.to, 0, '[]'));
    assert.ok(!result.error, result.error);
    assert.deepEqual(normalize(result.normal), example.normal, `${example.from}―${example.to}：通し`);
    assert.deepEqual(result.results.map(normalize), example.patterns, `${example.from}―${example.to}：分割`);
    for (const comparison of example.comparisonPatterns) {
      for (const segment of comparison.segments) {
        const checked = JSON.parse(globalThis.calculateOptimalSplitTicket(segment.from, segment.to, 0, '[]'));
        assert.deepEqual(normalize(checked.normal).segments, [segment], '比較例の各券');
      }
    }
    console.log(`${example.from}―${example.to}：経路・全パターン・比較例・金額が一致`);
  }
  console.log(`掲載時の版：${data.engineVersion}\n検証した版：${version}`);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}
