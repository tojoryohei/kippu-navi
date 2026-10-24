import { test, expect } from '@playwright/test';

// 実API・Go・WASMを使い、Worker通知を遅らせず描画フレームでUIを観測する。
const scenarios: { name: string; path: string; query: Record<string, string> }[] = [
  { name: 'online', path: '/split/auto/ticket', query: { from: '東京', to: '大宮' } },
  { name: 'offline', path: '/split/auto/ticket', query: { from: '東京', to: '大宮' } },
];
for (const scenario of scenarios) {
  test(`@performance 実WASMで段階表示と金額固定: ${scenario.name}`, async ({ page }, testInfo) => {
    test.skip(process.env.RUN_PERFORMANCE_TESTS !== '1', '描画時間の比較は明示実行時のみ検証する');
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1','localhost'].includes(url.hostname) || /^\/(ingest|monitoring)/.test(url.pathname)) return route.abort();
      if (scenario.name === 'offline' && url.pathname.startsWith('/api/')) return route.abort();
      return route.continue();
    });
    await page.addInitScript(() => {
      const observation = { start: 0, first: 0, paint: 0, complete: 0, counts: [] as number[], fares: [] as number[] };
      Object.assign(window, { streamObservation: observation });
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener('message', e => {
            if (e.data.type === 'partial_result') {
              observation.first ||= performance.now();
              observation.counts.push(e.data.result.results.length);
              observation.fares.push(...e.data.result.results.map((p: { totalFare?: number; totalAmount?: number }) => p.totalFare ?? p.totalAmount));
            }
            if (e.data.result?.streamed) observation.complete = performance.now();
          });
        }
        postMessage(message: unknown) {
          const type = (message as { type?: string }).type || '';
          if (type === 'calculate' || type.startsWith('calculateOptimal')) observation.start = performance.now();
          super.postMessage(message);
        }
      };
      function frame() {
        if (!observation.paint && Array.from(document.querySelectorAll('h2')).some(h => h.textContent === '計算結果')) {
          // 次のフレームで結果の描画機会があったことを確認する。
          requestAnimationFrame(() => { observation.paint ||= performance.now(); });
        }
        if (!observation.paint || !observation.complete) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    });
    await page.goto(`${scenario.path}?${new URLSearchParams(scenario.query)}`);
    await expect.poll(() => page.evaluate(() => (window as unknown as {streamObservation:{complete:number}}).streamObservation.complete)).toBeGreaterThan(0);
    await expect(page.getByRole('heading',{name:'計算結果',exact:true})).toBeVisible();
    await expect.poll(() => page.evaluate(() => (window as unknown as {streamObservation:{paint:number}}).streamObservation.paint)).toBeGreaterThan(0);
    const measured = await page.evaluate(() => (window as unknown as {streamObservation:{start:number;first:number;paint:number;complete:number;counts:number[];fares:number[]}}).streamObservation);
    expect(new Set(measured.fares).size).toBe(1);
    expect(measured.counts.reduce((a,b)=>a+b,0)).toBeGreaterThan(1);
    expect(measured.first).toBeLessThan(measured.complete);
    expect(measured.paint).toBeLessThan(measured.complete);
    const timing = { firstResultMs: measured.first-measured.start, firstPaintMs: measured.paint-measured.start, completionMs: measured.complete-measured.start, count: measured.fares.length };
    console.log(scenario.name, timing);
    await testInfo.attach('timing', { body: JSON.stringify(timing), contentType: 'application/json' });
  });
}

test('実WASMの逐次結果と従来の全件応答が一致する', async () => {
  const { execFileSync } = await import('node:child_process');
  execFileSync(process.execPath, ['--test','tests/wasm/split-streaming.test.mjs'], { stdio:'inherit',timeout:55_000 });
});

for (const offline of [false, true]) {
  test(`稚内→青森は分割前で終了し在来線の接続案内を表示する: ${offline ? 'offline' : 'online'}`, async ({ page }) => {
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      if (!['127.0.0.1','localhost'].includes(url.hostname) || /^\/(ingest|monitoring)/.test(url.pathname)) return route.abort();
      if (offline && url.pathname.startsWith('/api/')) return route.abort();
      return route.continue();
    });
    await page.addInitScript(() => {
      const events: {type: string}[] = [];
      Object.assign(window, { disconnectedEvents: events });
      const NativeWorker = window.Worker;
      window.Worker = class extends NativeWorker {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url,options);
          this.addEventListener('message',event=>events.push(event.data));
        }
      };
    });
    await page.goto(`/split/auto/ticket?${new URLSearchParams({from:'稚内',to:'青森'})}`);
    await expect(page.getByText('指定された区間はJR在来線のみで繋がっていません。経路入力検索を利用してください。',{exact:true})).toBeVisible();
    await expect(page.getByRole('heading',{name:'計算結果',exact:true})).toHaveCount(0);
    const events = await page.evaluate(() => (window as unknown as {disconnectedEvents:{type:string}[]}).disconnectedEvents);
    expect(events.some(event => event.type === 'partial_result' || event.type.startsWith('success'))).toBe(false);
  });
}
