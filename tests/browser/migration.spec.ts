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
  await expect(page.locator(".line-select__control").first()).toHaveCSS(
    "height",
    "38px",
  );
  await expect(page.locator(".line-select__single-value").first()).toHaveText(
    "外房",
  );
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

test("臨時駅を含む経路を定期券として計算できる", async ({
  page,
}) => {
  await isolateServices(page);
  const route = "鹿島サッカースタジアム[鹿島]鹿島神宮";
  await page.goto(`/fare/ticket?route=${encodeURIComponent(route)}`);
  await expect(page.getByRole("combobox").first()).toHaveValue(
    "鹿島サッカースタジアム",
  );

  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
  await expect(page.locator("p.text-red-500")).toHaveCount(0);
});

test("運賃計算の不正な駅名を種別切り替え後も再検証する", async ({ page }) => {
  await isolateServices(page);
  await page.goto("/fare/ticket");
  const input = page.getByRole("combobox").first();
  await input.fill("存在しない駅");
  await input.press("Tab");
  await expect(
    page.getByText("該当する駅が存在しません", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  await expect(
    page.getByText("該当する駅が存在しません", { exact: true }),
  ).toBeVisible();
});

test("空の運賃フォームで種別・期間を切り替えてもバリデーションエラーを表示しない", async ({
  page,
}) => {
  await isolateServices(page);
  await page.goto("/fare/ticket");

  const requiredMessages = [
    "発駅を入力してください",
    "経由路線を選択してください",
    "着駅を入力してください",
  ];
  const expectNoRequiredMessages = async () => {
    for (const message of requiredMessages) {
      await expect(page.getByText(message, { exact: true })).toHaveCount(0);
    }
  };

  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  await expectNoRequiredMessages();

  await page.getByRole("button", { name: "乗車券", exact: true }).click();
  await expect(page).toHaveURL(/\/fare\/ticket\?/);
  await expectNoRequiredMessages();

  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  for (const period of ["1箇月", "3箇月", "6箇月"]) {
    await page.getByRole("button", { name: period, exact: true }).click();
    await expectNoRequiredMessages();
  }
});

test("臨時駅を含む分割計算の期間変更でエラーにならない", async ({
  page,
}) => {
  await isolateServices(page);
  await page.goto(
    `/split/ticket?${new URLSearchParams({
      from: "鹿島サッカースタジアム",
      to: "鹿島神宮",
    })}`,
  );
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/pass\?/);
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
  await expect(page.locator("p.text-red-500")).toHaveCount(0);

  await page.getByRole("button", { name: "1箇月", exact: true }).click();
  await expect(page.locator("p.text-red-500")).toHaveCount(0);
});

test("WASMのロード失敗を表示する", async ({ page }) => {
  await isolateServices(page);
  await page.route("**/main.wasm", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto(`/split/ticket?${query}`);
  await expect(page.getByText(/main\.wasm.*404/)).toBeVisible();
});

test("古いエンジンURLの404時に現行資材へフォールバックして検索を継続する", async ({ page }) => {
  await isolateServices(page);
  const fallbackEngineBasePath = `/engine/${"f".repeat(64)}`;
  let staleEngineBasePath: string | undefined;
  let staleWasmRuntime404s = 0;
  let staleTicketGraph404s = 0;

  await page.route("**/deployment.json", route =>
    route.fulfill({ json: { enginePath: fallbackEngineBasePath } }),
  );
  await page.route("**/engine/**", async route => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/engine\/([a-f0-9]{64})(\/[^/]+)$/);
    if (!match) return route.continue();

    staleEngineBasePath ??= `/engine/${match[1]}`;
    const assetPath = match[2];
    if (assetPath === "/wasm_exec.js" && !url.pathname.startsWith(fallbackEngineBasePath) && staleWasmRuntime404s === 0) {
      staleWasmRuntime404s++;
      return route.fulfill({ status: 404, body: "stale engine runtime" });
    }
    if (assetPath === "/ticket_graph_data.bin" && !url.pathname.startsWith(fallbackEngineBasePath) && staleTicketGraph404s === 0) {
      staleTicketGraph404s++;
      return route.fulfill({ status: 404, body: "stale engine asset" });
    }

    if (url.pathname.startsWith(fallbackEngineBasePath) && staleEngineBasePath) {
      const rewritten = new URL(url);
      rewritten.pathname = `${staleEngineBasePath}${assetPath}`;
      return route.continue({ url: rewritten.toString() });
    }

    return route.continue();
  });

  await page.goto(`/split/ticket?${query}`);
  await expectTicket(page);
  expect(staleWasmRuntime404s).toBe(1);
  expect(staleTicketGraph404s).toBe(1);
});

test("経路APIの一時的なネットワーク失敗を再試行して検索を継続する", async ({ page }) => {
  await isolateServices(page);
  let attempts = 0;
  await page.route("**/api/split-ticket**", async route => {
    attempts++;
    if (attempts === 1) return route.abort("failed");
    return route.continue();
  });

  await page.goto(`/split/ticket?${query}`);
  await expectTicket(page);
  expect(attempts).toBe(2);
});

test("WASMの一時的な503を再試行して検索を継続する", async ({ page }) => {
  await isolateServices(page);
  let attempts = 0;
  await page.route("**/main.wasm", async route => {
    attempts++;
    if (attempts <= 2) return route.fulfill({ status: 503, body: "temporary" });
    return route.continue();
  });
  await page.goto(`/split/ticket?${query}`);
  await expectTicket(page);
  expect(attempts).toBe(3);
});

test("定期券グラフの障害中も乗車券検索を継続する", async ({ page }) => {
  await isolateServices(page);
  await page.route("**/pass_graph_data.bin", route => route.fulfill({ status: 503, body: "temporary" }));
  await page.goto(`/split/ticket?${query}`);
  await expectTicket(page);
});

test("2駅未満のAPI経路をWorkerへ渡さず拒否する", async ({ page }) => {
  await isolateServices(page);
  await page.route("**/api/split-ticket**", route => route.fulfill({ json: { normal: ["新茂原"], results: [] } }));
  await page.goto(`/split/ticket?${query}`);
  await expect(page.getByText("経路データの取得に失敗しました。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
});

test("在来線でつながっていない区間の業務エラーを表示する", async ({ page }) => {
  await isolateServices(page);
  const message = "指定された区間はJR在来線のみで繋がっていません。新幹線や私鉄線を利用する経路は検索対象外です。";
  await page.route("**/api/split-ticket**", route => route.fulfill({
    status: 422,
    json: { normal: null, results: [], error: message },
  }));
  await page.goto("/split/ticket?from=函館&to=新青森");
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
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
  // React Select sizes the input to its current text. A collapsed 2px input
  // makes the value appear as a clipped mark even though the control is wide.
  expect(dimensions.clientWidth).toBeGreaterThan(2);
  expect(dimensions.clientWidth).toBeGreaterThanOrEqual(dimensions.scrollWidth);
  await expect(
    page
      .locator(".station-select__option")
      .filter({ hasText: "鹿島サッカースタジアム" })
      .first(),
  ).toBeVisible();

  // A value restored from the URL must remain visible after a full reload too.
  await page.goto(
    `/fare/ticket?route=${encodeURIComponent("茂原[外房]千葉")}`,
  );
  const restored = page.getByRole("combobox").first();
  await expect(restored).toHaveValue("茂原");
  const restoredDimensions = await restored.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(restoredDimensions.clientWidth).toBeGreaterThan(2);
  expect(restoredDimensions.clientWidth).toBeGreaterThanOrEqual(
    restoredDimensions.scrollWidth,
  );

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
      const lineControl = page.locator(".line-select__control").first();
      await expect(lineControl).toBeVisible();
      await expect(lineControl).toHaveCSS("height", "38px");
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
    const inputDimensions = await input.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
    expect(inputDimensions.clientWidth).toBeGreaterThan(2);
    expect(inputDimensions.clientWidth).toBeGreaterThanOrEqual(
      inputDimensions.scrollWidth,
    );
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

const calculatorRoutes = [
  "/fare/ticket",
  "/fare/pass",
  "/split/ticket",
  "/split/pass",
  "/split/ic-pass",
];

test("計算ページ下部を関連リンクに整理する", async ({
  request,
}) => {
  for (const route of calculatorRoutes) {
    const html = await (await request.get(route)).text();
    expect(html, route).toContain("関連情報");
    expect(html, route).not.toContain("このツールでできること");
    expect(html, route).not.toContain("対象外・注意事項を確認");
    expect(html, route).not.toContain("計算条件とデータ確認日");
  }

  const splitTicketHtml = await (
    await request.get("/split/ticket")
  ).text();
  expect(splitTicketHtml).not.toContain("FAQPage");
  expect(splitTicketHtml).not.toContain("分割きっぷは違法ではありませんか？");

  const guideHtml = await (await request.get("/guide")).text();
  expect(guideHtml).toContain('id="how-to-search"');
  expect(guideHtml).toContain('id="how-to-buy"');
});

test("関連情報がモバイルで横にはみ出さない", async ({
  page,
}) => {
  await isolateServices(page);
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/split/ticket");

  await expect(page.getByRole("heading", { name: "関連情報" })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="calculator-resources-title"] a')).toHaveCount(3);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

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
