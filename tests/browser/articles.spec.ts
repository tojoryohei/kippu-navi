import { test, expect } from "@playwright/test";
import { articles } from "../../src/data/articles";
import examples from "../../src/data/split-ticket-examples.json" with { type: "json" };

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
});

test("記事はJavaScriptなしでも本文・出典・日付を読め、canonicalと構造化データが一致する", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 375, height: 812 } });
  const page = await context.newPage();
  await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
  const links = new Set<string>();
  for (const article of articles) {
    const path = `/articles/${article.slug}`;
    const response = await page.request.get(path);
    expect(response.status()).toBe(200);
    const info = await page.evaluate(html => {
      const doc = new DOMParser().parseFromString(html, "text/html");
      return {
        title: doc.querySelector('h1')?.textContent,
        canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href'),
        jsonLd: JSON.parse(doc.querySelector('main script[type="application/ld+json"]')?.textContent ?? "{}"),
        dates: [...doc.querySelectorAll('article header time')].map(n => n.getAttribute('datetime')),
        links: [...doc.querySelectorAll('article a[href^="/"]')].map(n => n.getAttribute('href')!),
        hasAuthor: !!doc.querySelector('article header a[href="/about"]'),
      };
    }, await response.text());
    expect(info.title).toBe(article.title);
    expect(info.canonical).toBe(`https://kippu-navi.com${path}`);
    expect(info.dates).toEqual([info.jsonLd.datePublished, info.jsonLd.dateModified]);
    expect(info.hasAuthor).toBe(true);
    info.links.forEach(link => links.add(link));
  }
  for (const href of links) expect((await page.request.get(href)).status()).toBe(200);
  await page.goto(`/articles/${articles[0].slug}`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(articles[0].title);
  await expect(page.getByRole("region", { name: "参照資料" }).getByRole("link").first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto('/split/auto/ticket');
  await expect(page.getByRole('complementary', { name: '計算の対象と条件' })).toBeVisible();
  await expect(page.locator('a[href="/articles/calculation-scope"]').first()).toBeVisible();
  await context.close();
});

test("保存した全計算例の合計と接続が整合する", () => {
  for (const example of examples.examples) {
    for (const pattern of [example.normal, ...example.patterns, ...example.comparisonPatterns]) {
      expect(pattern.segments.reduce((total,s) => total+s.fare+s.barrierFreeFee,0)).toBe(pattern.total);
      expect(pattern.segments[0].from).toBe(example.from);
      expect(pattern.segments.at(-1)?.to).toBe(example.to);
      for (const [index,segment] of pattern.segments.entries()) {
        expect(Number.isInteger(segment.fare)).toBe(true);
        expect(Number.isInteger(segment.barrierFreeFee)).toBe(true);
        expect(segment.path[0]).toBe(segment.from);
        expect(segment.path.at(-1)).toBe(segment.to);
        if (index > 0) expect(pattern.segments[index-1].to).toBe(segment.from);
      }
    }
  }
});

test('計算例のリンクから乗車駅・降車駅を復元する', async ({ page }) => {
  await page.goto('/articles/split-ticket-case-study');
  await page.getByRole('link',{name:'この乗車駅・降車駅を計算機に入力する'}).last().click();
  await expect(page).toHaveURL(/from=.*&to=/);
  await expect(page.getByRole('combobox').first()).toHaveValue('東京');
  await expect(page.getByRole('combobox').nth(1)).toHaveValue('品川');
});

for (const width of [375,1280]) {
  test(`${width}pxの記事導線と関連記事の全件表示`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/articles');
    if (width === 375) await page.getByRole('button',{name:'メニューバーを開く'}).click();
    await expect(page.getByRole('banner').getByRole('link',{name:'はじめての方へ',exact:true})).toBeVisible();
    await expect(page.getByRole('banner').getByRole('link',{name:'解説記事',exact:true})).toHaveCount(0);
    await page.getByRole('banner').getByRole('link',{name:'はじめての方へ',exact:true}).click();
    await page.getByRole('link',{name:'解説記事一覧',exact:true}).click();
    await expect(page).toHaveURL('/articles');
    await page.goto('/split/auto/ticket');
    await expect(page.getByRole('combobox').first()).toBeVisible();
    const inputBox = await page.getByRole('combobox').first().boundingBox();
    const scopeBox = await page.getByRole('complementary',{name:'計算の対象と条件'}).boundingBox();
    expect(scopeBox!.y).toBeGreaterThan(inputBox!.y + inputBox!.height);
    const resources = page.locator('section[aria-labelledby="calculator-resources-title"]');
    await expect(resources.getByRole('link',{name:/分割きっぷの仕組み/})).toBeVisible();
    await resources.getByRole('link',{name:/実際の計算例/}).click();
    await expect(page).toHaveURL('/articles/split-ticket-case-study');
    await expect(page.locator('table').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
