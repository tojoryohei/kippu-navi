import { test, expect } from "../support/fixtures";

const paths = ["/split/auto/ticket", "/split/auto/pass", "/split/auto/ic-pass", "/fare/ticket", "/fare/pass", "/split/route/ticket", "/split/route/pass"];

test("Worker本体の評価例外を元の診断に残し、再計算で復旧する", async ({ page, context }) => {
  let blocked = true;
  const failures: Array<{ contexts: { engine_diagnostics: { workerPhase: string; workerBootstrapStage: string; exception: { name: string; message: string } } } }> = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname === "/monitoring") {
      const payload = route.request().postData()?.split("\n")[2];
      if (payload) {
        const event = JSON.parse(payload);
        if (event.tags?.error_code === "worker_runtime_failed") failures.push(event);
      }
      return route.fulfill({ status: 200, json: {} });
    }
    if (blocked && /\/split-engine[^/]*\.js$/.test(url.pathname)) {
      return route.fulfill({ status: 200, contentType: "application/javascript",
        body: 'throw new SyntaxError("Worker本体の評価に失敗しました");' });
    }
    return route.continue();
  });
  await page.goto("/fare/ticket?" + new URLSearchParams({ route: "東京[東海道]品川", mode: "normal" }));
  await expect.poll(() => failures.length).toBe(1);
  const diagnostic = failures[0].contexts.engine_diagnostics;
  expect(diagnostic.workerPhase).toBe("initializing");
  expect(diagnostic.workerBootstrapStage).toBe("module_import");
  expect(diagnostic.exception.name).toBe("SyntaxError");
  expect(diagnostic.exception.message).toBe("Worker本体の評価に失敗しました");
  blocked = false;
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  expect(failures).toHaveLength(1);
});

test("Workerの読込失敗を元の検索に記録し、通常の計算ボタンから実WASMで復旧する", async ({ page, context }) => {
  let loads = 0;
  const workerEvents: Array<{ tags: Record<string, string>; contexts: { engine_diagnostics: { workerPhase: string; workerScriptProbe?: { status: number }; workerBootstrapStage?: string; exception?: { message: string } } } }> = [];
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return route.abort();
    if (url.pathname === "/monitoring") {
      const payload = route.request().postData()?.split("\n")[2];
      if (payload) {
        const event = JSON.parse(payload);
        if (event.tags?.error_code === "worker_runtime_failed") workerEvents.push(event);
      }
      return route.fulfill({ status: 200, json: {} });
    }
    if (/\/split\.worker[^/]*\.js$/.test(url.pathname)) {
      if (route.request().resourceType() === "fetch") return route.fulfill({ status: 404, contentType: "text/html", body: "missing" });
      if (++loads <= 2) return route.abort();
    }
    return route.continue();
  });
  await page.addInitScript(() => {
    const state = window as unknown as { engineDiagnostics: { urls: string[]; locations: string[]; tracking: IdleRequestCallback[] } };
    state.engineDiagnostics = { urls: [], locations: [], tracking: [] };
    const requestIdle = window.requestIdleCallback.bind(window);
    window.requestIdleCallback = (callback, options) => {
      if (options) return requestIdle(callback, options);
      return state.engineDiagnostics.tracking.push(callback);
    };
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        state.engineDiagnostics.urls.push(String(url));
        this.addEventListener("message", event => {
          if (event.data.type === "ready") state.engineDiagnostics.locations.push(event.data.diagnostics.workerLocation);
        });
      }
    };
  });
  await page.goto("/fare/ticket?" + new URLSearchParams({ route: "東京[東海道]品川", mode: "normal" }));
  const calculate = page.locator('button[type="submit"]');
  await expect(calculate).toBeEnabled();
  await expect(calculate).not.toHaveText('計算を再試行');
  await calculate.click();
  await expect(page.getByText("通信環境を確認して、もう一度計算してください。", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    (window as unknown as { engineDiagnostics: { tracking: IdleRequestCallback[] } }).engineDiagnostics.tracking.length
  )).toBeGreaterThan(0);
  await calculate.click();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  const info = await page.evaluate(() => {
    const { urls, locations, tracking } = (window as unknown as { engineDiagnostics: { urls: string[]; locations: string[]; tracking: IdleRequestCallback[] } }).engineDiagnostics;
    for (const callback of tracking.splice(0)) callback({ didTimeout: false, timeRemaining: () => 50 });
    return { urls, locations };
  });
  // 直接通知と遅延した検索計測をまとめる。連続する同じ例外はSDKも抑制する。
  await expect.poll(() => workerEvents.length).toBe(1);
  expect(workerEvents.every(event => event.contexts.engine_diagnostics.workerPhase === "before_start")).toBe(true);
  expect(workerEvents.every(event => event.contexts.engine_diagnostics.workerScriptProbe?.status === 404)).toBe(true);
  expect(workerEvents[0].tags.failure_id).toBeTruthy();
  expect(info.urls).toHaveLength(3);
  expect(info.urls[0]).toMatch(/\/_astro\/split\.worker.+\.js$/);
  expect(info.urls[1]).toBe(info.urls[0]);
  expect(info.urls[2]).toBe(info.urls[0]);
  expect(info.locations.some(location => location.endsWith(info.urls[2]))).toBe(true);
});

test("Reactの初期化途中に記事へ移動してもエラーにならない", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return url.hostname === "localhost" || url.hostname === "127.0.0.1"
      ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    if (location.pathname !== "/split/auto/ticket") return;
    // React Schedulerを止め、Astroの通知後も初回commitが未完了の状態を再現する。
    const NativeMessageChannel = window.MessageChannel;
    window.MessageChannel = class extends NativeMessageChannel {
      constructor() {
        super();
        this.port2.postMessage = () => {};
      }
    };
  });
  await page.goto("/split/auto/ticket");
  await expect(page.locator("astro-island[ssr]")).toHaveCount(0);
  await expect(page.locator('[data-calculator-ready]')).toHaveAttribute("data-calculator-ready", "false");
  await page.locator('a[href="/articles/what-is-split-ticket"]').click();
  await expect(page).toHaveURL(/\/articles\/what-is-split-ticket$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test("全計算ページの初期HTMLに操作不可のフォームが含まれる", async ({ request }) => {
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-calculator-ready="false"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<form[\s>]/);
    expect(html).toMatch(/\sinert(?:[\s=>])/);
    expect(html).toMatch(/<input[\s>]/);
  }
});

for (const path of ["/split/auto/ticket", "/fare/ticket", "/split/route/ticket"]) {
  test(`起動前後の高さとURL復元・操作禁止解除を確認する: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
      if (route.request().resourceType() === 'script') await gate;
      return route.continue();
    });
    await page.goto(path + "?from=" + encodeURIComponent("東京"), { waitUntil: 'commit' });
    const shell = page.locator('[data-calculator-ready]');
    try {
      await expect(shell.locator('form')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(shell.locator('[inert]')).toHaveCount(1);
      await expect(shell).toHaveAttribute('aria-busy', 'true');
      const before = await shell.boundingBox();
      release();
      await expect(shell).toHaveAttribute('data-calculator-ready', 'true');
      await expect(shell.getByRole('combobox').first()).toHaveValue('東京');
      await expect(shell.locator('[inert]')).toHaveCount(0);
      await expect(shell.getByRole('status')).toHaveCount(0);
      const after = await shell.boundingBox();
      expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
    } finally {
      release();
    }
  });
}
