import assert from 'node:assert/strict';
import test from 'node:test';
import examples from '../../src/data/split-ticket-examples.json' with { type: 'json' };

test('保存した全計算例の合計と接続が整合する', () => {
  for (const example of examples.examples) {
    for (const pattern of [example.normal, ...example.patterns, ...example.comparisonPatterns]) {
      const segments = pattern.segments;
      assert.equal(segments.reduce((total, segment) => total + segment.fare + segment.barrierFreeFee, 0), pattern.total);
      assert.equal(segments[0].from, example.from);
      assert.equal(segments.at(-1).to, example.to);
      for (const [index, segment] of segments.entries()) {
        assert.ok(Number.isInteger(segment.fare));
        assert.ok(Number.isInteger(segment.barrierFreeFee));
        assert.equal(segment.path[0], segment.from);
        assert.equal(segment.path.at(-1), segment.to);
        if (index > 0) assert.equal(segments[index - 1].to, segment.from);
      }
    }
  }
});
