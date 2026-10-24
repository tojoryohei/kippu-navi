import assert from 'node:assert/strict';
import test from 'node:test';
import { createSplitResultStream } from '../../src/lib/split-result-stream.ts';
import { appendSplitResults } from '../../src/lib/append-split-results.ts';

test('初回は即時、以降は件数・時間・終了で差分を通知する', () => {
  const events = [];
  let time = 0;
  const stream = createSplitResultStream(e => events.push(e), 7, 'ticket', 'auto', () => time);
  const accept = id => stream.accept(JSON.stringify({ normal: { fare: 100 }, results: [{ id }] }));
  accept(0);
  assert.equal(events.length, 1);
  accept(0); // 重複
  for (let i=1; i<50; i++) accept(i);
  assert.equal(events.length, 1);
  accept(50);
  assert.equal(events[1].result.results.length, 50);
  assert.equal(events[1].result.normal, undefined);
  time=100; accept(51);
  assert.equal(events.length, 3);
  accept(52); stream.flush(); stream.flush();
  assert.equal(events.length, 4);
  assert.deepEqual(events.flatMap(e => e.result.results).map(p => p.id), Array.from({length:53}, (_,i)=>i));
  assert.ok(events.every(e => e.type === 'partial_result' && e.requestId === 7));
});

test('追加時に分割前運賃・先頭結果・順序を維持して重複を除く', () => {
 const first = { normal: { fare: 100 }, results: [{ totalFare: 80, segments: ['A','B'] }] };
 const next = { normal: undefined, results: [...first.results, { totalFare: 80, segments: ['A','C'] }] };
 const result = appendSplitResults(first,next);
 assert.equal(result.normal, first.normal);
 assert.equal(result.results[0], first.results[0]);
 assert.equal(result.results.length,2);
 assert.equal(first.results.length,1);
});

test('表示要約が同じでも途中経路が違う解は保持する', () => {
 const plan = { totalFare: 80, segments: ['A','B'] };
 const first = { normal: { fare: 100 }, results: [{ ...plan, id: 'A-X-B' }] };
 const delta = { normal: undefined, results: [{ ...plan, id: 'A-Y-B' }] };
 assert.equal(appendSplitResults(first,delta).results.length,2);
});
