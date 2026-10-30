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
  await page.goto(`/split/auto/ticket?${query}`);
  await expectTicket(page);
  await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
  await page.reload();
  await expectTicket(page);
  await page.evaluate(() => {
    const link = document.createElement("a");
    link.href = "/split/auto/ticket?from=茂原&to=新茂原";
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
  await page.goto(`/split/auto/ticket?${query}`);
  await expectTicket(page);
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/auto\/pass\?/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("定期券");
  await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "IC定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/auto\/ic-pass\?/);
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/split\/auto\/pass\?/);
  await page.goBack();
  await expectTicket(page);
  await page.goForward();
  await expect(page).toHaveURL(/\/split\/auto\/pass\?/);
  await expect(
    page.getByRole("heading", { name: "計算結果", exact: true }),
  ).toBeVisible();
  expect(workers).toBe(1);
});

test("乗車券運賃は専用Workerを使い、定期券・分割ではWorkerを共有する", async ({
  page,
}) => {
  await isolateServices(page);
  await page.addInitScript(() => {
    const violations: string[] = [];
    Object.assign(window, { cspViolations: violations });
    document.addEventListener("securitypolicyviolation", event => {
      violations.push(`${event.effectiveDirective}: ${event.blockedURI}`);
    });
  });
  let workers = 0;
  let closedWorkers = 0;
  page.on("worker", worker => {
    workers++;
    worker.on("close", () => closedWorkers++);
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `/fare/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原" })}`,
  );
  await expect(page.getByText("¥160", { exact: true }).first()).toBeVisible();
  expect(workers).toBe(1);
  expect(closedWorkers).toBe(0);
  // 説明欄の高さに依存せず、種別ボタンが固定ヘッダーに隠れない位置に置く。
  await page.getByRole("button", { name: "定期券", exact: true }).evaluate(button => {
    window.scrollTo({ top: button.getBoundingClientRect().top + window.scrollY - 200, behavior: "instant" });
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
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
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await page.locator("header [data-split-trigger]").click();
  await page.locator("header").getByRole("link", { name: "経路自動検索", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "乗車券を計算" }),
  ).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/\/fare\/pass\?/);
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
  expect(workers).toBe(2);
  await expect.poll(() => closedWorkers).toBe(1);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { cspViolations: string[] }).cspViolations)).toEqual([]);
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
    "乗車駅を入力してください",
    "経由路線を選択してください",
    "降車駅を入力してください",
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
  await expect(page).toHaveURL(/\/fare\/ticket$/);
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
    `/split/auto/ticket?${new URLSearchParams({
      from: "鹿島サッカースタジアム",
      to: "鹿島神宮",
    })}`,
  );
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/auto\/pass\?/);
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
  await page.goto(`/split/auto/ticket?${query}`);
  await expect(page.getByText(/main\.wasm.*404/)).toBeVisible();
});

test("エンジン初期化失敗後もメインの計算ボタンから再試行できる", async ({ page }) => {
  await isolateServices(page);
  let allowWasm = false;
  await page.route("**/main.wasm", route =>
    allowWasm
      ? route.continue()
      : route.fulfill({ status: 503, body: "temporary" }),
  );

  await page.goto(`/split/auto/ticket?${query}`);
  const retryCalculationButton = page.getByRole("button", { name: "計算を再試行", exact: true });
  await expect(retryCalculationButton).toBeVisible();
  await expect(page.getByRole("button", { name: "再試行", exact: true })).toHaveCount(0);

  allowWasm = true;
  await retryCalculationButton.click();
  await expectTicket(page);
});

test("運賃計算もメインの計算ボタンからエンジンを再試行できる", async ({ page }) => {
  await isolateServices(page);
  let allowWasm = false;
  await page.route("**/main.wasm", route =>
    allowWasm
      ? route.continue()
      : route.fulfill({ status: 503, body: "temporary" }),
  );

  await page.goto(`/fare/ticket?route=${encodeURIComponent("新茂原[外房]茂原")}`);
  const retryCalculationButton = page.getByRole("button", { name: "計算を再試行", exact: true });
  await expect(retryCalculationButton).toBeVisible();
  await expect(page.getByRole("button", { name: "再試行", exact: true })).toHaveCount(0);

  allowWasm = true;
  await retryCalculationButton.click();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
});

for (const staleStatus of [403, 404]) test(`古いエンジンURLの${staleStatus}時に現行資材へフォールバックして検索を継続する`, async ({ page }) => {
  await isolateServices(page);
  const fallbackEngineBasePath = `/engine/${"f".repeat(64)}`;
  let staleEngineBasePath: string | undefined;
  let staleWasmRuntimeFailures = 0;
  let staleTicketGraphFailures = 0;

  await page.route("**/deployment.json", route =>
    route.fulfill({ json: { enginePath: fallbackEngineBasePath } }),
  );
  await page.route("**/engine/**", async route => {
    const url = new URL(route.request().url());
    const match = url.pathname.match(/^\/engine\/([a-f0-9]{64})(\/[^/]+)$/);
    if (!match) return route.continue();

    staleEngineBasePath ??= `/engine/${match[1]}`;
    const assetPath = match[2];
    if (assetPath === "/wasm_exec.js" && !url.pathname.startsWith(fallbackEngineBasePath) && staleWasmRuntimeFailures === 0) {
      staleWasmRuntimeFailures++;
      return route.fulfill({ status: staleStatus, body: "stale engine runtime" });
    }
    if (assetPath === "/ticket_graph_data.bin" && !url.pathname.startsWith(fallbackEngineBasePath) && staleTicketGraphFailures === 0) {
      staleTicketGraphFailures++;
      return route.fulfill({ status: staleStatus, body: "stale engine asset" });
    }

    if (url.pathname.startsWith(fallbackEngineBasePath) && staleEngineBasePath) {
      const rewritten = new URL(url);
      rewritten.pathname = `${staleEngineBasePath}${assetPath}`;
      return route.continue({ url: rewritten.toString() });
    }

    return route.continue();
  });

  await page.goto(`/split/auto/ticket?${query}`);
  await expectTicket(page);
  expect(staleWasmRuntimeFailures).toBe(1);
  expect(staleTicketGraphFailures).toBe(1);
});

test("経路APIの一時的なネットワーク失敗を再試行して検索を継続する", async ({ page }) => {
  await isolateServices(page);
  let attempts = 0;
  await page.route("**/api/split/auto/ticket**", async route => {
    attempts++;
    if (attempts === 1) return route.abort("failed");
    return route.fulfill({
      json: {
        normal: ["新茂原", "茂原"],
        results: [["新茂原", "茂原"]],
      },
    });
  });

  await page.goto(`/split/auto/ticket?${query}`);
  await expectTicket(page);
  expect(attempts).toBe(2);
});

test("APIのタイムアウトで端末内計算へ切り替える", async ({ page }) => {
  await isolateServices(page);
  await page.clock.install();
  let requested = false;
  await page.route("**/api/split/auto/ticket**", async () => { requested = true; return new Promise(() => {}); });
  await page.goto(`/split/auto/ticket?${query}`);
  await expect.poll(() => requested).toBe(true);
  await page.clock.runFor(15_100);
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible({ timeout: 25_000 });
  await expectTicket(page);
  await expect(page.getByRole("button", { name: "計算中...", exact: true })).toHaveCount(0);
});

test("WASMの一時的な503を再試行して検索を継続する", async ({ page }) => {
  await isolateServices(page);
  let attempts = 0;
  await page.route("**/main.wasm", async route => {
    attempts++;
    if (attempts <= 2) return route.fulfill({ status: 503, body: "temporary" });
    return route.continue();
  });
  await page.goto(`/split/auto/ticket?${query}`);
  await expectTicket(page);
  expect(attempts).toBe(3);
});

test("定期券グラフの障害中も乗車券検索を継続する", async ({ page }) => {
  await isolateServices(page);
  await page.route("**/pass_graph_data.bin", route => route.fulfill({ status: 503, body: "temporary" }));
  await page.goto(`/split/auto/ticket?${query}`);
  await expectTicket(page);
});

test("2駅未満のAPI経路をWorkerへ渡さず拒否する", async ({ page }) => {
  await isolateServices(page);
  await page.route("**/api/split/auto/ticket**", route => route.fulfill({ json: { normal: ["新茂原"], results: [] } }));
  await page.goto(`/split/auto/ticket?${query}`);
  await expect(page.getByText("経路データの取得に失敗しました。", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
});

for (const kind of ["ticket", "pass"] as const) {
test(`${kind === "ticket" ? "乗車券" : "定期券"}で在来線でつながっていない区間の業務エラーを表示する`, async ({ page }) => {
  await isolateServices(page);
  const message = "指定された区間はJR在来線のみで繋がっていません。経路入力検索を利用してください。";
  await page.route(`**/api/split/auto/${kind}**`, route => route.fulfill({
    status: 422,
    json: { normal: null, results: [], error: message },
  }));
  const month = kind === "pass" ? "&months=6" : "";
  await page.goto(`/split/auto/${kind}?from=函館&to=新青森${month}`);
  await expect(page.getByText(message, { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
});
}

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
  await page.goto(`/split/auto/ticket?${query}`);
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

test("駅候補のアクセシビリティ通知を画面に露出させない", async ({ page }) => {
  await isolateServices(page);
  for (const route of ["/fare/ticket", "/split/auto/pass"]) {
    await page.goto(route);
    await expect(page.getByRole("combobox").first()).toBeVisible();
    if (route === "/fare/ticket") {
      const lineControl = page.locator(".line-select__control").first();
      await expect(lineControl).toBeVisible();
    }
    const input = page.getByRole("combobox").first();
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
    await expect(page.locator("style[data-emotion]")).toHaveCount(0);
    const liveRegion = page.locator('[aria-live="polite"]').first();
    await expect(liveRegion).toHaveCSS("width", "1px");
    expect(await liveRegion.boundingBox()).toMatchObject({
      width: 1,
      height: 1,
    });
  }
});

const routes = [
  "/articles/split-ticket-case-study",
  "/articles/calculation-scope",
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
  "/split/auto/ticket",
  "/split/auto/pass",
  "/split/auto/ic-pass",
  "/split/route/ticket",
  "/split/route/pass",
];

const calculatorRoutes = [
  "/fare/ticket",
  "/fare/pass",
  "/split/auto/ticket",
  "/split/auto/pass",
  "/split/auto/ic-pass",
  "/split/route/ticket",
  "/split/route/pass",
];

test("計算ページ下部を関連リンクに整理する", async ({
  request,
}) => {
  for (const route of calculatorRoutes) {
    const html = await (await request.get(route)).text();
    expect(html, route).toContain("関連情報");
  }

  const splitTicketHtml = await (
    await request.get("/split/auto/ticket")
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
  await page.goto("/split/auto/ticket");

  await expect(page.getByRole("heading", { name: "関連情報" })).toBeVisible();
  await expect(page.locator('section[aria-labelledby="calculator-resources-title"] a').first()).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("全ページのHTML・canonical・sitemap・404を確認する", async ({
  request,
}) => {
  for (const route of routes) {
    const response = await request.get(route);
    expect(response.status(), route).toBe(200);
    const html = await response.text();
    expect(html, route).toContain(
      `rel="canonical" href="https://kippu-navi.com${route}"`,
    );
    expect(html, route).toMatch(/<title>[^<]*きっぷナビ[^<]*<\/title>/);
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
