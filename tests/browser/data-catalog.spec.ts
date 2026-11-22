import { test, expect } from '../support/fixtures';
import { blockExternalServices } from '../support/browser-helpers';
import { catalogLines, distances, fareRecords } from '../../src/lib/data-catalog';

test.beforeEach(async ({ page }) => { await blockExternalServices(page); });

test('データ一覧は絞り込みなしで全件表示し、駅別距離と特例運賃を確認できる', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /データ一覧.*各路線/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('データ一覧');
  await page.getByRole('link', { name: /^路線と駅の情報 JRの/ }).click();
  await expect(page).toHaveURL('/data/lines');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('路線と駅の情報');
  const lines = page.getByRole('region', { name: '路線一覧', exact: true }).locator('tbody tr');
  await expect(lines.locator('th a')).toHaveText(catalogLines.map(line => line.name));
  await page.getByRole('link', { name: '吾妻線', exact: true }).click();
  const row = page.getByRole('row').filter({ hasText: '祖母島' });
  await expect(page.getByRole('columnheader')).toHaveText(['駅名', '営業キロ', '換算キロ', '乗換路線']);
  await expect(page.getByRole('rowheader', { name: '渋川', exact: true })).toBeVisible();
  await expect(row).toContainText('7.7');
  await expect(row).toContainText('8.5');
  const shibukawa = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '渋川', exact: true }) });
  await expect(shibukawa).toContainText('しぶかわ');
  await shibukawa.getByRole('link', { name: '上越線', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('上越線の営業キロ・換算キロ');
  await expect(page).toHaveURL(/#station-\d+$/);
  await page.goto('/data/fares');
  const fares = page.getByRole('region', { name: /^(特定運賃|調整運賃)一覧$/ }).locator('tbody tr');
  await expect(fares).toHaveCount(fareRecords.length);
  for (const category of ['特定運賃', '調整運賃']) {
    const table = page.getByRole('region', { name: `${category}一覧`, exact: true });
    await expect(table.locator('tbody tr')).toHaveCount(fareRecords.filter(record => record.category === category).length);
    await expect(table.getByRole('columnheader')).toHaveText(['区間', '金額']);
  }
  await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name: '豊橋・愛知御津', exact: true }) }).filter({ hasText: '定期券' }).getByRole('link')).toHaveAttribute('href', /^\/fare\/pass\?route=/);
  await expect(page.getByRole('link', { name: '東京・西船橋', exact: true }).first()).toHaveAttribute('href', `/fare/ticket?${new URLSearchParams({ route: '東京[総武]西船橋' })}`);
});

test('JavaScriptなしのモバイルでも全件・出典・配布ファイルを読める', async ({ browser, diagnostics }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  diagnostics.observe(context);
  const page = await context.newPage();
  await blockExternalServices(page);
  for (const path of ['/data', '/data/lines', '/data/fares', '/data/guide', '/data/lines/吾妻線']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    for (const name of ['全件CSVをダウンロード', '全件JSONをダウンロード']) {
      const expected = path === '/data/guide' ? 2 : 0;
      await expect(page.getByRole('link', { name, exact: true })).toHaveCount(expected);
    }
    if (path === '/data/guide') await expect(page.getByRole('heading', { name: 'CSV・JSONの項目定義', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  const distanceResponse = await page.request.get('/data/downloads/distances.json');
  expect(distanceResponse.status()).toBe(200);
  const distanceData = await distanceResponse.json();
  expect(distanceData.records).toHaveLength(distances.length);
  expect(distanceData.records.every((r: { station: string; kind: string }) => typeof r.station === 'string' && r.kind !== 'connecting')).toBe(true);
  const fares = await (await page.request.get('/data/downloads/special-fares.json')).json();
  expect(fares.records).toHaveLength(fareRecords.length);
  for (const name of ['distances', 'special-fares']) {
    const response = await page.request.get(`/data/downloads/${name}.csv`);
    expect(response.status()).toBe(200);
    const bytes = await response.body();
    expect([...bytes.subarray(0, 3)]).toEqual([239, 187, 191]);
  }
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('<loc>https://kippu-navi.com/data/lines</loc>');
  expect(sitemap).toContain(`/data/lines/${encodeURIComponent('吾妻線')}`);
  await page.goto('/data/lines/品鶴線');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('品鶴線の営業キロ・換算キロ');
  const shinagawa = page.getByRole('row').filter({ has: page.getByRole('rowheader', { name: '品川', exact: true }) });
  await expect(shinagawa).toContainText('しながわ');
  await expect(shinagawa.getByRole('cell').filter({ hasText: /^0\.0$/ })).toHaveCount(1);
  await expect(shinagawa.getByRole('link', { name: '東海道本線', exact: true })).toBeVisible();
  await context.close();
});

test('駅情報は表内で横スクロールでき、運賃は320px幅でも収まる', async ({ page }) => {
  for (const width of [320, 375, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lineName of ['東海道本線', '品鶴線']) {
      await page.goto(`/data/lines/${lineName}`);
      await expect(page.getByRole('columnheader')).toHaveCount(4);
      await expect(page.getByRole('rowheader').first()).toBeVisible();
      const scroll = page.locator('.data-scroll');
      await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      await expect(page.getByRole('columnheader', { name: '乗換路線', exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.goto('/data/fares');
    const toyohashi = page.getByRole('row').filter({ has: page.getByRole('link', { name: '豊橋・愛知御津', exact: true }) }).filter({ hasText: '定期券' });
    await expect(toyohashi).toContainText('1箇月：—');
    await expect(toyohashi).toContainText('3箇月：—');
    await expect(toyohashi).toContainText('6箇月：28,300円');
    await expect(page.getByRole('row').filter({ has: page.getByRole('link', { name: '東京・西船橋', exact: true }) }).first()).toContainText('350円');
    for (const table of await page.locator('.data-scroll').all()) expect(await table.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
