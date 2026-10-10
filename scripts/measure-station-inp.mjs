// npm run build と node scripts/preview-pwa.mjs の後に実行する。
// 実ユーザーのINPではなく、Backspace操作のEvent Timingを比較する計測。
import { chromium } from '@playwright/test';

const baseURL = process.env.BENCHMARK_BASE_URL || 'http://localhost:4321';
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  for (const path of ['/fare/ticket', '/split/auto/ticket']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin
      ? route.continue() : route.abort());
    await page.goto(new URL(path, baseURL).href);
    await page.locator('[data-calculator-ready=true]').waitFor();
    await page.evaluate(() => document.fonts.ready);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.evaluate(() => {
      window.stationTimingSamples = [];
      new PerformanceObserver(list => {
        for (const entry of list.getEntries()) {
          if (entry.interactionId && entry.name === 'keydown') {
            window.stationTimingSamples.push({
              duration: entry.duration,
              processing: entry.processingEnd - entry.processingStart,
              delay: entry.processingStart - entry.startTime,
              // durationは丸められるため、この差分も概算値。
              presentation: Math.max(0, entry.startTime + entry.duration - entry.processingEnd),
            });
          }
        }
      }).observe({ type: 'event', durationThreshold: 16 });
    });
    const input = page.getByRole('combobox').first();
    for (const query of ['新', 'し', '東京']) {
      const samples = [];
      for (let index = 0; index < 22; index++) {
        await input.fill(`${query}a`);
        await page.waitForTimeout(120);
        await page.evaluate(() => { window.stationTimingSamples = []; });
        await input.press('Backspace');
        await page.waitForTimeout(180);
        const entries = await page.evaluate(() => window.stationTimingSamples);
        // 最初の2回はウォームアップ。16ms未満の未通知を0msとは扱わない。
        if (index >= 2) samples.push(entries.at(-1) ?? { duration: null, belowThreshold: true });
      }
      results.push({ path, query, options: await page.getByRole('option').count(), samples });
    }
    await page.close();
  }
  console.log(JSON.stringify({ browser: browser.version(), cpuRate: 4, results }, null, 2));
} finally {
  await browser.close();
}
