import { test, expect, type Page } from "@playwright/test";

async function localCalculationOnly(page: Page, apiResponses: Record<string, unknown> = {}) {
  const apiCalls: string[] = [];
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname.startsWith("/ingest/")) return route.abort();
    if (url.pathname.startsWith("/api/")) {
      if (url.pathname in apiResponses) return route.fulfill({ json: apiResponses[url.pathname] });
      apiCalls.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    const replies: Record<string, unknown>[] = [];
    Object.assign(window, { routeTestReplies: replies });
    window.Worker = class extends OriginalWorker {
      constructor (url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener("message", event => replies.push(event.data));
      }
    };
  });
  return apiCalls;
}

async function lastResult(page: Page, type: string) {
  await expect.poll(() => page.evaluate(type => {
    const replies = (window as unknown as { routeTestReplies: { type: string; result?: unknown }[] }).routeTestReplies;
    return replies.some(reply => reply.type === type);
  }, type)).toBe(true);
  return page.evaluate(type => {
    const replies = (window as unknown as { routeTestReplies: { type: string; result?: unknown }[] }).routeTestReplies;
    return replies.filter(reply => reply.type === type).at(-1)?.result;
  }, type) as Promise<{ fare: number; barrierFreeFee: number; charge: number; data: { fare: number; replacements?: { from: string; to: string; status: string }[]; normal: { fare: number }; results: { totalFare: number; segments: unknown[] }[] } }>;
}

for (const mode of ["normal", "cheapest", "uncorrect"]) {
  test(`新幹線展開・控除後に残る重複を運賃・分割ページで拒否する ${mode}`, async ({ page }) => {
    const calls = await localCalculationOnly(page);
    for (const route of [
      "三河安城[新幹線]名古屋[東海道]（中）金山", "（中）金山[東海道]名古屋[新幹線]三河安城",
      "新下関[新幹線]小倉[鹿児島線]門司", "門司[鹿児島線]小倉[新幹線]新下関",
      "南小倉[日豊]西小倉[鹿児島線]小倉[新幹線]博多[鹿児島線]吉塚",
      "吉塚[鹿児島線]博多[新幹線]小倉[鹿児島線]西小倉[日豊]南小倉",
      "黒崎[鹿児島線]小倉[新幹線]博多", "博多[新幹線]小倉[鹿児島線]黒崎",
      "折尾[筑豊本線]新飯塚[後藤寺線]田川後藤寺[日田彦山]城野[日豊]小倉[新幹線]博多",
    ]) {
      for (const path of ["/fare/ticket", "/split/route/ticket"]) {
        await page.goto(`${path}?${new URLSearchParams({ route, mode })}`);
        await expect(page.getByText("経路が重複しています。", { exact: true })).toBeVisible();
        await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
        const replies = await page.evaluate(() => (window as unknown as {
          routeTestReplies: { type: string; error?: string }[];
        }).routeTestReplies);
        expect(replies.some(reply => reply.type === "error" && reply.error === "経路が重複しています。")).toBe(true);
        expect(replies.some(reply => reply.type === "success_route_ticket" || reply.type === "success_route_split_ticket")).toBe(false);
      }
    }
    expect(calls).toEqual([]);
  });
}

for (const mode of ["normal", "cheapest", "uncorrect"]) {
  test(`第43条の2の適用経路を検証用展開後も計算できる ${mode}`, async ({ page }) => {
    const calls = await localCalculationOnly(page);
    for (const route of [
      "新下関[新幹線]博多[鹿児島線]吉塚[篠栗線]柚須",
      "柚須[篠栗線]吉塚[鹿児島線]博多[新幹線]新下関",
    ]) {
      const query = new URLSearchParams({ route, mode, maxSplits: "1" });
      await page.goto(`/fare/ticket?${query}`);
      const fare = await lastResult(page, "success_route_ticket");
      await page.goto(`/split/route/ticket?${query}`);
      const split = await lastResult(page, "success_route_split_ticket");
      expect(split.data.normal.fare).toBe(fare.data.fare);
      await page.getByText("詳細オプション", { exact: true }).click();
      for (const name of ["幡生", "下関", "門司", "黒崎", "折尾", "香椎"]) {
        await expect(page.getByRole("checkbox", { name, exact: true })).toHaveCount(0);
      }
    }
    expect(calls).toEqual([]);
  });
}

for (const mode of ["normal", "cheapest", "uncorrect"]) {
  test(`経路入力検索分割 ${mode}: 本物のWASMで計算し運賃ページと比較する`, async ({ page }) => {
    const apiCalls = await localCalculationOnly(page);
    const kanaLogs: string[] = [];
    page.on("console", message => { if (message.text().includes("カナコード：")) kanaLogs.push(message.text()); });
    const query = new URLSearchParams({ route: "新茂原[外房]茂原", mode });
    await page.goto(`/fare/ticket?${query}`);
    const fare = await lastResult(page, "success_route_ticket");
    expect(kanaLogs).toHaveLength(1);
    kanaLogs.length = 0;
    await expect(page.getByRole("region", { name: "計算モードの違い", exact: true })).toHaveCount(0);
    await page.goto(`/split/route/ticket?${query}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("分割乗車券計算（経路入力検索）");
    const modeDescription = page.getByRole("region", { name: "計算モードの違い", exact: true });
    await expect(modeDescription).toHaveCount(1);
    await expect(modeDescription.getByRole("term")).toHaveText(["通常", "最安", "補正禁止"]);
    await expect(modeDescription.getByRole("definition")).toHaveCount(3);
    const split = await lastResult(page, "success_route_split_ticket");
    expect(split.data.normal.fare).toBe(fare.data.fare);
    expect(split.data.results).toHaveLength(1);
    expect(split.data.results[0].segments).toHaveLength(1);
    expect(split.data.results[0].totalFare).toBe(fare.data.fare);
    await expect(page.getByRole("heading", { name: "分割前の乗車券", exact: true })).toBeVisible();
    await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
    await page.reload();
    await lastResult(page, "success_route_split_ticket");
    expect(kanaLogs).toEqual([]);
    await expect(page.getByRole("combobox").first()).toHaveValue("新茂原");
    if (mode === "normal") {
      await page.getByRole("button", { name: "経路を逆転", exact: true }).click();
      await expect(page.getByRole("combobox").first()).toHaveValue("茂原");
      await page.getByRole("button", { name: "乗車券を計算", exact: true }).click();
      await expect(page).toHaveURL(/route=.*mode=normal/);
      await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("route")).toBe("茂原[外房]新茂原");
      await page.getByRole("radio", { name: /^最安 / }).check();
      await expect(page).toHaveURL(/mode=cheapest/);
      await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
      await expect(page.getByRole("combobox").first()).toHaveValue("茂原");
    }
    expect(apiCalls).toEqual([]);
  });
}

test("全最安パターンの展開・折りたたみと画面遷移", async ({ page }, testInfo) => {
  const apiCalls = await localCalculationOnly(page);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "東京[新幹線]名古屋", mode: "normal" })}`);
  const result = await lastResult(page, "success_route_split_ticket");
  expect(result.data.results.length).toBeGreaterThan(1);
  const expand = page.getByRole("button", { name: "残りのパターンを展開する" });
  await expect(expand).toBeVisible();
  await expand.click();
  await expect(page.getByRole("heading", { name: /^パターン / })).toHaveCount(result.data.results.length);
  await page.getByRole("button", { name: "追加のパターンを閉じる" }).click();
  await expect(expand).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("kippu-route-split-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("kippu-route-split-mobile.png"), fullPage: true });
  await page.getByRole("link", { name: "経路自動検索", exact: false }).click();
  await expect(page).toHaveURL(/\/split\/auto\/ticket$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("分割乗車券計算（経路自動検索）");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  expect(apiCalls).toEqual([]);
  expect(errors).toEqual([]);
});

test("分割結果の料金配置を自動検索と経路入力検索で揃える", async ({ page }) => {
  const kanaLogs: string[] = [];
  page.on("console", message => { if (message.text().includes("カナコード：")) kanaLogs.push(message.text()); });
  const apiCalls = await localCalculationOnly(page, {
    "/api/split-ticket": { normal: ["新茂原", "茂原"], results: [["新茂原", "茂原"]] },
  });
  const pages = [
    `/split/auto/ticket?${new URLSearchParams({ from: "新茂原", to: "茂原", mode: "normal" })}`,
    `/split/route/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原", mode: "normal" })}`,
  ];

  for (const pathname of pages) {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(pathname);
    await lastResult(page, pathname.includes("/split/auto/") ? "success" : "success_route_split_ticket");
    await expect(page.getByRole("heading", { name: "分割前の乗車券", exact: true })).toBeVisible();
    await expect(page.getByText("分割前運賃と同じ", { exact: true })).toBeVisible();

    const normalSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "分割前の乗車券", exact: true }) });
    await expect(normalSection.locator("div.flex.justify-between.items-center")).toHaveCount(1);
    await expect(normalSection.locator("div.text-3xl.font-bold.text-gray-800")).toHaveCount(1);

    const bestSection = page.locator("section").filter({ has: page.getByRole("heading", { name: "最安分割運賃", exact: true }) });
    await expect(bestSection.locator("div.flex.justify-between.items-center")).toHaveCount(1);
    await expect(bestSection.locator("div.text-4xl.font-bold.text-blue-900")).toHaveCount(1);

    const segment = page.getByText("利用区間", { exact: true }).first().locator("../..");
    await expect(segment.locator("div.flex.justify-between.items-center.mt-2")).toHaveCount(1);
    await expect(segment.locator("div.text-xs.text-gray-500.mt-1.ml-10")).toHaveCount(1);
    await expect(segment.locator("div.font-bold.text-xl.ml-4")).toHaveCount(1);

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(normalSection.locator("div.flex.justify-between.items-center")).toHaveCount(1);
    await expect(bestSection.locator("div.flex.justify-between.items-center")).toHaveCount(1);
    await expect(segment.locator("div.flex.justify-between.items-center.mt-2")).toHaveCount(1);
  }

  expect(kanaLogs).toEqual([]);
  expect(apiCalls).toEqual([]);
});

test("経路入力検索の分割禁止駅をfieldsetの凡例で識別する", async ({ page }) => {
  const apiCalls = await localCalculationOnly(page);
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原" })}`);
  await page.getByText("詳細オプション", { exact: true }).click();
  await expect(page.locator('label[for="no-split-stations"]')).toHaveCount(0);
  await expect(page.locator("fieldset legend")).toHaveText("分割禁止駅を選択");
  const orphanLabels = await page.locator("label[for]").evaluateAll(labels => labels
    .filter(label => !document.getElementById((label as HTMLLabelElement).htmlFor))
    .map(label => (label as HTMLLabelElement).htmlFor));
  expect(orphanLabels).toEqual([]);
  expect(apiCalls).toEqual([]);
});

for (const month of [1, 3, 6]) {
  for (const mode of ["normal", "cheapest", "uncorrect"]) {
    test(`経路入力検索定期券 ${month}箇月 ${mode}: 運賃計算と同じ金額をWASMで返す`, async ({ page }) => {
      const apiCalls = await localCalculationOnly(page);
      const query = new URLSearchParams({ route: "新茂原[外房]茂原", month: String(month), mode });
      await page.goto(`/fare/pass?${query}`);
      const fare = await lastResult(page, "success_route_pass");
      await expect(page.getByRole("region", { name: "計算モードの違い", exact: true })).toHaveCount(0);
      await page.goto(`/split/route/pass?${query}`);
      const result = await lastResult(page, "success_route_split_pass");
      expect(result.data.normal.fare).toBe(fare.fare + fare.barrierFreeFee + fare.charge);
      expect(result.data.results).toHaveLength(1);
      expect(result.data.results[0].totalFare).toBe(result.data.normal.fare);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("分割定期券計算（経路入力検索）");
      await expect(page.getByRole("region", { name: "計算モードの違い", exact: true })).toHaveCount(1);
      await expect(page.getByRole("heading", { name: `分割前の定期券${({ 1: "１", 3: "３", 6: "６" } as Record<number, string>)[month]}箇月`, exact: true })).toBeVisible();
      await expect(page.getByText(`${month}箇月定期券`, { exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: `定期券${({ 1: "１", 3: "３", 6: "６" } as Record<number, string>)[month]}箇月を計算`, exact: true })).toBeEnabled();
      await page.reload();
      await lastResult(page, "success_route_split_pass");
      await expect(page.getByRole("heading", { name: `分割前の定期券${({ 1: "１", 3: "３", 6: "６" } as Record<number, string>)[month]}箇月`, exact: true })).toBeVisible();
      await expect(page.getByText(`${month}箇月定期券`, { exact: true })).toHaveCount(0);
      expect(apiCalls).toEqual([]);
    });
  }
}

test("経路入力検索の券種と期間の切り替えで経路・モードを引き継ぐ", async ({ page }, testInfo) => {
  const apiCalls = await localCalculationOnly(page);
  const route = "新茂原[外房]茂原";
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route, mode: "cheapest" })}`);
  await lastResult(page, "success_route_split_ticket");
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/split\/route\/pass\?/);
  await expect(page.getByRole("heading", { name: `分割前の定期券６箇月`, exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("route")).toBe(route);
  await expect(page.getByRole("radio", { name: /^最安 / })).toBeChecked();
  for (const month of [1, 3]) {
    await page.getByRole("button", { name: `${month}箇月`, exact: true }).click();
    await expect(page.getByRole("heading", { name: `分割前の定期券${({ 1: "１", 3: "３", 6: "６" } as Record<number, string>)[month]}箇月`, exact: true })).toBeVisible();
    await expect(page.getByText(`${month}箇月定期券`, { exact: true })).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("month")).toBe(String(month));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("kippu-pass-route-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "乗車券", exact: true }).click();
  await expect(page).toHaveURL(/split\/route\/ticket\?/);
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("route")).toBe(route);
  expect(new URL(page.url()).searchParams.get("mode")).toBe("cheapest");
  await page.goBack();
  await expect(page.getByRole("heading", { name: `分割前の定期券３箇月`, exact: true })).toBeVisible();
  expect(apiCalls).toEqual([]);
});

test("経路入力検索の定期券でも新幹線の入力制限を適用する", async ({ page }) => {
  const apiCalls = await localCalculationOnly(page);
  await page.goto(`/split/route/pass?${new URLSearchParams({ route: "東京[新幹線]名古屋" })}`);
  await expect(page.getByRole("button", { name: "定期券６箇月を計算", exact: true })).toBeDisabled();
  await expect(page.getByText(/新幹線/).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
  expect(apiCalls).toEqual([]);
});

test("不正な計算モードは通常モードに戻す", async ({ page }) => {
  const apiCalls = await localCalculationOnly(page);
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原", mode: "unknown" })}`);
  await lastResult(page, "success_route_split_ticket");
  await expect(page.getByRole("radio", { name: /^通常 / })).toBeChecked();
  expect(new URL(page.url()).searchParams.get("mode")).toBe("normal");
  expect(apiCalls).toEqual([]);
});

for (const kind of ["ticket", "pass"]) {
  test(`経路入力検索${kind}の分割条件をチェックボックスとクエリで指定する`, async ({ page }, testInfo) => {
    const apiCalls = await localCalculationOnly(page);
    const params = new URLSearchParams({ route: "新茂原[外房]上総一ノ宮", mode: "normal", maxSplits: "1", noSplitStation: "茂原", month: "3" });
    await page.goto(`/split/route/${kind}?${params}`);
    await page.getByText("詳細オプション", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "茂原", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox")).toHaveCount(2);
    await expect(page.getByRole("checkbox", { name: "八積", exact: true })).not.toBeChecked();
    await expect(page.locator("#max-splits")).toBeVisible();
    await page.setViewportSize({ width: 320, height: 750 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    if (kind === "ticket") await page.screenshot({ path: testInfo.outputPath("route-split-options-mobile.png"), fullPage: true });
    await page.getByRole("checkbox", { name: "八積", exact: true }).check();
    await expect(page.getByRole("checkbox", { name: "八積", exact: true })).toBeChecked();
    await page.getByRole("button", { name: kind === "ticket" ? "乗車券を計算" : "定期券３箇月を計算", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll("noSplitStation")).toEqual(["茂原", "八積"]);
    await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
    const result = await lastResult(page, `success_route_split_${kind}`);
    expect(result.data.results.every(plan => plan.segments.length === 1)).toBe(true);
    await page.reload();
    await page.getByText("詳細オプション", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "八積", exact: true })).toBeChecked();
    await page.getByRole("button", { name: "経路を逆転", exact: true }).click();
    await expect(page.getByRole("checkbox")).toHaveCount(2);
    await expect(page.getByRole("checkbox").first()).toHaveAccessibleName("八積");
    expect(new URL(page.url()).searchParams.get("maxSplits")).toBe("1");
    await page.goto(`/split/route/${kind}?${new URLSearchParams({ route: "新茂原[外房]茂原", noSplitStation: "八積", maxSplits: "1" })}`);
    await expect(page.getByText("選択済み：0駅", { exact: true })).toHaveCount(1);
    await expect(page.getByText("経路外になった分割禁止駅を解除しました。", { exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: kind === "ticket" ? "乗車券を計算" : "定期券６箇月を計算", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.getAll("noSplitStation")).toEqual([]);
    expect(apiCalls).toEqual([]);
  });
}

test("駅候補の取得失敗時に禁止駅を削除しない", async ({ page }) => {
  await localCalculationOnly(page);
  await page.addInitScript(() => {
    const OriginalWorker = window.Worker;
    window.Worker = class extends OriginalWorker {
      postMessage(message: { type: string; payload: { requestId: number } }) {
        if (message.type === "getRouteSplitCandidates") {
          setTimeout(() => this.dispatchEvent(new MessageEvent("message", { data: { type: "error", requestId: message.payload.requestId, error: "候補取得テストエラー" } })), 10);
        } else super.postMessage(message);
      }
    };
  });
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "新茂原[外房]上総一ノ宮", noSplitStation: "茂原" })}`);
  await page.getByText("詳細オプション", { exact: true }).click();
  await expect(page.getByText("駅一覧を取得できませんでした：候補取得テストエラー")).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll("noSplitStation")).toEqual(["茂原"]);
  await expect(page.getByText("選択済み：1駅", { exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "分割しない駅の一覧" })).toHaveCount(0);
});

test("最安の新幹線を在来線に置き換え、禁止駅と計算結果に反映する", async ({ page }) => {
  const calls = await localCalculationOnly(page);
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "三島[新幹線]静岡", mode: "cheapest", maxSplits: "1", noSplitStation: "富士" })}`);
  await page.getByText("詳細オプション", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "富士", exact: true })).toBeChecked();
  await expect(page.getByRole("checkbox", { name: "（東）新富士", exact: true })).toHaveCount(0);
  const result = await lastResult(page, "success_route_split_ticket");
  expect(result.data.results.every(plan => plan.segments.length <= 2)).toBe(true);
  expect(new URL(page.url()).searchParams.get("route")).toBe("三島[新幹線]静岡");
  await page.getByRole("radio", { name: /^通常/ }).check();
  await expect(page.getByRole("checkbox", { name: "（東）新富士", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "富士", exact: true })).toHaveCount(0);
  await expect(page.getByText("選択済み：0駅", { exact: true })).toBeVisible();
  await expect(page.getByText("経路外になった分割禁止駅を解除しました。", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "乗車券を計算", exact: true }).click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("noSplitStation")).toEqual([]);
  expect(calls).toEqual([]);
});

test("在来線化で重複した区間を戻し、独立した置き換えを維持する", async ({ page }) => {
  await localCalculationOnly(page);
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "富士[東海道]三島[新幹線]掛川", mode: "cheapest", maxSplits: "1" })}`);
  await page.getByText("詳細オプション", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: "（東）新富士", exact: true })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "焼津", exact: true })).toBeVisible();
});

test("長距離の在来線展開を端末内WASMで全件計算する", async ({ page }) => {
  test.setTimeout(120_000);
  const calls = await localCalculationOnly(page);
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "熱海[新幹線]小倉", mode: "cheapest" })}`);
  await page.waitForFunction(() => (window as unknown as { routeTestReplies: { type: string }[] }).routeTestReplies.some(reply => reply.type === "success_route_split_ticket"), undefined, { timeout: 100_000 });
  const result = await lastResult(page, "success_route_split_ticket");
  expect(result.data.results.length).toBeGreaterThan(0);
  expect(result.data.replacements).toEqual([
    { from: "熱海", to: "新下関", status: "replaced" },
  ]);
  const elapsed = await page.evaluate(() => (window as unknown as { routeTestReplies: { type: string; result: { time: number } }[] }).routeTestReplies.find(reply => reply.type === "success_route_split_ticket")?.result.time);
  console.log(`熱海〜小倉 WASM計算: ${elapsed}ms; ${result.data.results.length} patterns`);
  expect(calls).toEqual([]);
});

for (const [route, via] of [
  ["熱海[新幹線]新下関", "東海道・山陽・岩徳線・山陽"],
  ["三島[新幹線]静岡[東海道]東静岡", "三島・新幹線・静岡・東海道"],
  ["一ノ関[東北新幹線]（北）福島[東北]東福島", "東北・仙台・新幹線・（北）福島・東北"],
  ["博多[九州新幹線]新八代", "鹿児島線"],
  ["東京[東北新幹線]新青森", "東北・一ノ関・新幹線・北上・東北・盛岡・新幹線・新青森"],
]) {
  test(`運賃計算の最安で単独駅を通過する経由を在来線表示する：${route}`, async ({ page }) => {
    const calls = await localCalculationOnly(page);
    await page.goto(`/fare/ticket?${new URLSearchParams({ route, mode: "cheapest" })}`);
    await expect(page.getByText(`経由：${via}`, { exact: true })).toBeVisible();
    expect(calls).toEqual([]);
  });
}
