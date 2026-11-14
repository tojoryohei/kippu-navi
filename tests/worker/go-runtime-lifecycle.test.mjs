import assert from 'node:assert/strict';
import test from 'node:test';
import { monitorGoRuntime } from '../../src/lib/go-runtime-lifecycle.ts';

for (const code of [0, 2]) test(`Go終了コード${code}とpanic出力を一度だけ通知する`, async () => {
  const failures = [], written = [];
  let finish;
  const runtime = { exit() {}, run: () => new Promise(resolve => { finish = resolve; }) };
  const output = { writeSync(fd, buffer) { written.push(fd); return buffer.length; } };
  const monitor = monitorGoRuntime(runtime, output, (error, diagnostic) => failures.push({ error, diagnostic }));
  monitor.run({});
  output.writeSync(1, new TextEncoder().encode('収集しない標準出力'));
  const bytes = new TextEncoder().encode('panic: 先頭の原因\n' + 'あ'.repeat(9000) + '\nスタック末尾\n');
  // 分割されたUTF-8も文字化けさせず、先頭と末尾を残して長さを制限する。
  output.writeSync(2, bytes.slice(0, 8));
  output.writeSync(2, bytes.slice(8));
  runtime.exit(code);
  finish();
  await Promise.resolve();
  monitor.fail(new Error('Go program has already exited'));
  assert.equal(failures.length, 1);
  assert.equal(failures[0].diagnostic.exitCode, code);
  assert.ok(failures[0].diagnostic.stderr.startsWith('panic: 先頭の原因\n'));
  assert.ok(failures[0].diagnostic.stderr.endsWith('スタック末尾\n'));
  assert.equal(failures[0].diagnostic.stderr.length, 8000);
  assert.ok(!failures[0].diagnostic.stderr.includes('収集しない'));
  assert.ok(!failures[0].diagnostic.stderr.includes('\uFFFD'));
  assert.deepEqual(written, [1, 2, 2]);
});

for (const mode of ['throw', 'reject', 'resolve']) test(`Go.runの${mode}も終了として通知する`, async () => {
  const original = new Error('元の障害');
  const failures = [];
  const runtime = { exit() {}, run() {
    if (mode === 'throw') throw original;
    return mode === 'reject' ? Promise.reject(original) : Promise.resolve();
  } };
  monitorGoRuntime(runtime, { writeSync: () => 0 }, error => failures.push(error)).run({});
  await Promise.resolve();
  assert.equal(failures.length, 1);
  if (mode !== 'resolve') assert.equal(failures[0], original);
});
