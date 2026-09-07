import { test, expect, type Page } from "@playwright/test";

const query = new URLSearchParams({ from: "新茂原", to: "茂原" }).toString();

async function isolateServices(page: Page) {
  // 本物のWASM/BINを使い、計測送信とAPIの探索結果だけを固定する。
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1")
      return route.abort();
    if (url.pathname.startsWith("/ingest/")) return route.abort();
    if (url.pathname.startsWith("/api/"))
      return route.fulfill({
        json: {
          normal: ["新茂原", "茂原"],
          results: [["新茂原", "茂原"]],
        },
      });
    return route.continue();
  });
}

async function expectTicket(page: Page) {
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("¥160", { exact: true }).first()).toBeVisible();
}

test("直接URL・再読み込み・別のクエリから入力とWASM計算を復元する", async ({
  page,
}) => {
  await isolateServices(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/split/ticket?${query}`);
  await expectTicket(page);
  await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
  await page.reload();
  await expectTicket(page);
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/split/ticket?from=茂原&to=新茂原";
    link.textContent = "逆方向の検索";
    document.body.append(link);
    link.click();
  });
  await expect(page.getByRole("combobox").first()).toHaveValue("茂原");
  await page.goBack();
  await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
  await expectTicket(page);
  expect(errors).toEqual([]);
});

test("乗車券・定期券・IC定期券の遷移と履歴でWorkerを再生成しない", async ({
  page,
}) => {
  await isolateServices(page);
  let workers = 0;
  page.on("worker", () => workers++);
  await page.goto(`/split/ticket?${query}`);
  await expectTicket(page);
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/pass\?/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("定期券");
  await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "IC定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/ic-pass\?/);
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/split\/pass\?/);
  await page.goBack();
  await expectTicket(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/split\/pass\?/);
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  expect(workers).toBe(1);
});

test("運賃計算と分割計算で同じWorkerを使い、モードに応じた結果を表示する", async ({
  page,
}) => {
  await isolateServices(page);
  let workers = 0;
  page.on("worker", () => workers++);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/fare/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原" })}`,
  );
  await expect(page.getByText("¥160", { exact: true }).first()).toBeVisible();
  await page.evaluate(() => {
    const y = Math.min(
      500,
      document.documentElement.scrollHeight - innerHeight,
    );
    window.scrollTo(0, y);
  });
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("定期券");
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator('header a[href="/split/ticket"]').click();
  await expect(
    page.getByRole("button", { name: "乗車券を計算" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
  expect(workers).toBe(1);
  expect(errors).toEqual([]);
});

test("WASMのロード失敗を表示する", async ({ page }) => {
  await isolateServices(page);
  await page.route("**/main.wasm", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/split/ticket");
  await expect(page.getByText(/WASM binary fetch failed/)).toBeVisible();
});

test("初期化中も入力画面が表示され、完了後に計算できる", async ({ page }) => {
  await isolateServices(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/main.wasm", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto(`/split/ticket?${query}`);
  await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
  await expect(page.getByText("計算中です...", { exact: true })).toBeVisible();
  release();
  await expectTicket(page);
});

test("駅入力欄が横幅いっぱいになり候補メニューを表示する", async ({ page }) => {
  await isolateServices(page);
  await page.goto("/fare/ticket");

  const input = page.getByRole("combobox").first();
  await input.fill("鹿島サッカースタジアム");
  await expect(input).toHaveValue("鹿島サッカースタジアム");
  const dimensions = await input.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(dimensions.clientWidth).toBeGreaterThan(200);
  expect(dimensions.clientWidth).toBeGreaterThanOrEqual(dimensions.scrollWidth);
  await expect(
    page
      .locator(".station-select__option")
      .filter({ hasText: "鹿島サッカースタジアム" })
      .first(),
  ).toBeVisible();

});

test("記事ページはReactをhydrateせず、プリフェッチとモバイルメニューが動く", async ({
  page,
}) => {
  await isolateServices(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/articles/jr-fare-system");
  await expect(page.locator("astro-island")).toHaveCount(0);
  await page.getByRole("button", { name: "メニューバーを開く" }).click();
  await expect(page.locator("#site-menu")).toBeVisible();
  await page.locator('#site-menu a[href="/guide"]').click();
  await expect(page).toHaveURL("/guide");
  await expect(
    page.getByRole("button", { name: "メニューバーを開く" }),
  ).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await expect(page.locator("footer a").first()).toHaveAttribute(
    "data-astro-prefetch",
    "false",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  const prefetch = page.waitForRequest(
    (request) => new URL(request.url()).pathname === "/fare/ticket",
  );
  await page.locator('header a[href="/fare/ticket"]').hover();
  await prefetch;
});

test("駅候補のアクセシビリティ通知を画面に露出させない", async ({ page }) => {
  await isolateServices(page);
  for (const route of ["/fare/ticket", "/split/pass"]) {
    await page.goto(route);
    await expect(page.getByRole("combobox").first()).toBeVisible();
    const placeholder = page
      .locator(".station-select__placeholder")
      .first();
    const beforeStyleRemoval = await placeholder.boundingBox();
    // ClientRouter遷移でEmotionのstyle要素が失われても表示を維持する。
    await page.evaluate(() => {
      document.querySelectorAll("style[data-emotion]").forEach((style) => {
        style.remove();
      });
    });
    const afterStyleRemoval = await placeholder.boundingBox();
    expect(beforeStyleRemoval).not.toBeNull();
    expect(afterStyleRemoval).not.toBeNull();
    expect(
      Math.abs(beforeStyleRemoval!.x - afterStyleRemoval!.x),
    ).toBeLessThanOrEqual(1);
    if (route === "/fare/ticket") {
      await expect(
        page.locator('[class*="__control--is-disabled"]').first(),
      ).toHaveCSS("background-color", "rgb(242, 242, 242)");
    }
    const input = page.getByRole("combobox").first();
    const inputBox = await input.boundingBox();
    const placeholderBox = await placeholder.boundingBox();
    expect(inputBox).not.toBeNull();
    expect(placeholderBox).not.toBeNull();
    expect(Math.abs(inputBox!.x - placeholderBox!.x)).toBeLessThan(20);
    await input.fill("hoge");
    await input.focus();
    const noOptions = page
      .locator(".station-select__menu-notice--no-options")
      .first();
    await expect(noOptions).toBeVisible();
    await expect(noOptions).toHaveCSS("padding", "8px 12px");
    const liveRegion = page.locator('[aria-live="polite"]').first();
    await expect(liveRegion).toHaveCSS("width", "1px");
    await expect(liveRegion).toHaveCSS("height", "1px");
    expect(await liveRegion.boundingBox()).toMatchObject({
      width: 1,
      height: 1,
    });
  }
});

const routes = [
  "/",
  "/about",
  "/articles",
  "/articles/how-to-buy-split-pass",
  "/articles/how-to-buy-split-ticket",
  "/articles/jr-fare-system",
  "/articles/merit-demerit",
  "/articles/popular-routes",
  "/articles/what-is-split-ticket",
  "/changelog",
  "/contact",
  "/fare/ticket",
  "/fare/pass",
  "/guide",
  "/logic",
  "/privacy",
  "/split/ticket",
  "/split/pass",
  "/split/ic-pass",
];

test("全既存URLのHTML・canonical・sitemap・404を維持する", async ({
  request,
}) => {
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const html = await response.text();
    expect(html, route).toContain(
      `rel="canonical" href="https://kippu-navi.com${route}"`,
    );
    expect(html, route).toMatch(/<title>[^<]+きっぷナビ<\/title>/);
    expect(html, route).toContain('name="description"');
    expect(html, route).toContain('property="og:url"');
    expect(html, route).toContain("application/ld+json");
    expect(html, route).not.toContain("/_next/");
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  for (const route of routes)
    expect(sitemap).toContain(
      `<loc>https://kippu-navi.com${route === "/" ? "" : route}</loc>`,
    );
  expect((await request.get("/robots.txt")).status()).toBe(200);
  expect((await request.get("/favicon.ico")).status()).toBe(200);
  expect((await request.get("/does-not-exist-astro-migration")).status()).toBe(
    404,
  );
});
