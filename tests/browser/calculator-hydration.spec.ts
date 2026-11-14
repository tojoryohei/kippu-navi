import { test, expect } from "../support/fixtures";
import { selectStation } from "../support/browser-helpers";

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
      if (route.request().resourceType() === "fetch") return route.fulfill({ status: 503, contentType: "text/html", body: "unavailable" });
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
  expect(workerEvents.every(event => event.contexts.engine_diagnostics.workerScriptProbe?.status === 503)).toBe(true);
  expect(workerEvents[0].tags.failure_id).toBeTruthy();
  expect(info.urls).toHaveLength(3);
  expect(info.urls[0]).toMatch(/\/_astro\/split\.worker.+\.js$/);
  expect(info.urls[1]).toBe(info.urls[0]);
  expect(info.urls[2]).toBe(info.urls[0]);
  expect(info.locations.some(location => location.endsWith(info.urls[2]))).toBe(true);
});

for (const auto of [false, true]) test(`旧Workerの404は入力条件を残して自動更新する（経路自動=${auto}）`, async ({ page, context }) => {
  let missing = true;
  let loads = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { normal: ["新橋", "品川"], results: [["新橋", "品川"]] } });
    if (missing && /\/split\.worker[^/]*\.js$/.test(url.pathname)) {
      // 診断の404が返るまでに変更した入力も、自動更新時に保持する。
      const attempt = ++loads;
      await gate;
      if (attempt === 2) missing = false;
      return route.fulfill({ status: 404, body: "missing" });
    }
    return route.continue();
  });
  await page.goto(auto
    ? "/split/auto/ticket?" + new URLSearchParams({ from: "東京", to: "品川" })
    : "/fare/ticket?" + new URLSearchParams({ route: "東京[東海道]品川", mode: "normal" }));
  await selectStation(page, page.getByRole("combobox").first(), "新橋");
  if (!auto) {
    await page.locator(".line-select__control").first().click();
    await page.getByRole("option", { name: "東海道", exact: true }).click();
    await selectStation(page, page.getByRole("combobox").nth(2), "品川");
  }
  // 最初のWorkerと診断だけ404にし、次のページでは資材を取得できる状態にする。
  release();
  await expect(page).toHaveURL(auto ? /from=%E6%96%B0%E6%A9%8B/ : /route=%E6%96%B0%E6%A9%8B/);
  await expect(page.getByRole("combobox").first()).toHaveValue("新橋");
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ページを再読み込み", exact: true })).toHaveCount(0);
});

test("自動更新後もWorkerが404なら再更新せず案内文だけを表示する", async ({ page, context }) => {
  let documents = 0;
  await context.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (route.request().isNavigationRequest()) documents++;
    if (/\/split\.worker[^/]*\.js$/.test(url.pathname)) return route.fulfill({ status: 404, body: "missing" });
    return route.continue();
  });
  await page.goto("/fare/ticket?" + new URLSearchParams({ route: "東京[東海道]品川" }));
  await expect.poll(() => documents).toBe(2);
  await expect(page.getByText("計算に必要なファイルが見つかりません。ページを再読み込みしてからご利用ください。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "ページを再読み込み", exact: true })).toHaveCount(0);
  // 再描画されても自動更新回数が増えないことを確認する。
  await page.getByRole("radio", { name: /最安/ }).check();
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  expect(documents).toBe(2);
});

test("Go終了の診断を残し、新しいWorkerで再計算できる", async ({ page, context }) => {
  let injectExit = true;
  const errors: Array<{ contexts: { engine_diagnostics: { goRuntime: { exitCode: number; stderr: string } } } }> = [];
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname === "/monitoring") {
      const payload = route.request().postData()?.split("\n")[2];
      if (payload) {
        const event = JSON.parse(payload);
        if (event.tags?.error_code === "wasm_runtime_failed") errors.push(event);
      }
      return route.fulfill({ status: 200, json: {} });
    }
    if (injectExit && url.pathname.endsWith("/wasm_exec.js")) {
      injectExit = false;
      const response = await route.fetch();
      // 実WASMの準備完了後に終了を注入する。元のpanic原因の再現とは区別する。
      return route.fulfill({ response, body: await response.text() + `
        const originalRun = Go.prototype.run;
        Go.prototype.run = function(instance) {
          const runtime = this;
          const send = self.postMessage.bind(self);
          self.postMessage = (message, ...args) => {
            send(message, ...args);
            if (message.type === 'ready' && message.capability === 'pass') {
              globalThis.fs.writeSync(2, new TextEncoder().encode('panic: 検証用の終了\\n'));
              runtime.exited = true;
              runtime.exit(2);
            }
          };
          return originalRun.call(this, instance);
        };` });
    }
    return route.continue();
  });
  await page.goto("/fare/ticket?" + new URLSearchParams({ route: "東京[東海道]品川" }));
  await expect(page.getByText("計算エンジンが停止しました。もう一度計算してください。", { exact: true })).toBeVisible();
  await expect.poll(() => errors.length).toBe(1);
  expect(errors[0].contexts.engine_diagnostics.goRuntime).toEqual({ exitCode: 2, stderr: 'panic: 検証用の終了\n' });
  await page.locator('button[type="submit"]').click();
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  expect(errors).toHaveLength(1);
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

for (const { legacy, late } of [{ legacy: true, late: false }, { legacy: true, late: true }, { legacy: false, late: true }]) {
  test(`WASMの${late ? "事前確認後の本体" : "事前確認"}の実行拒否を${legacy ? "旧環境の案内" : "現行環境の障害"}として扱う`, async ({ page, context }) => {
    const monitoring: string[] = [];
    let apiRequests = 0, workerLoads = 0;
    await context.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") return route.abort();
      if (url.pathname === "/monitoring") {
        monitoring.push(route.request().postData() || "");
        return route.fulfill({ status: 200, json: {} });
      }
      if (url.pathname.startsWith("/api/")) {
        apiRequests++;
        return route.fulfill({ json: { normal: ["東京", "品川"], results: [["東京", "品川"]] } });
      }
      if (/\/split\.worker[^/]*\.js$/.test(url.pathname)) {
        workerLoads++;
        const response = await route.fetch();
        const body = await response.text();
        const userAgent = legacy ? 'Object.defineProperty(navigator,"userAgent",{value:"Mozilla/5.0 (iPad; CPU OS 15_8_8 like Mac OS X) AppleWebKit/605.1.15 Version/15.6.8 Mobile/15E148 Safari/604.1"});\n' : "";
        // 実際の事前確認は通し、本体のバイト列をinstantiateする段階だけ拒否する。
        const rejectEngine = late ? `const instantiate = WebAssembly.instantiate.bind(WebAssembly);
          WebAssembly.instantiate = (source, imports) => source instanceof ArrayBuffer && source.byteLength > 1000
            ? Promise.reject(new EvalError("Refused to create a WebAssembly object because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: script-src 'self' 'wasm-unsafe-eval'"))
            : instantiate(source, imports);\n` : "";
        return route.fulfill({ response, body: userAgent + rejectEngine + body,
          headers: late ? response.headers() : { ...response.headers(), "content-security-policy": "script-src 'self'" } });
      }
      return route.continue();
    });
    await page.goto("/split/auto/ticket?from=東京&to=品川");
    if (legacy) {
      await expect(page.getByText("この端末で計算するにはiOS 16以降が必要です。iOSを更新してからご利用ください。", { exact: true })).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeEnabled();
      const requestsBeforeRetry = apiRequests;
      await page.locator('button[type="submit"]').click();
      await expect(page.locator('button[type="submit"]')).toBeEnabled();
      expect(workerLoads).toBe(1);
      expect(apiRequests).toBe(requestsBeforeRetry);
      if (!late) expect(apiRequests).toBe(0);
      expect(monitoring.some(body => body.includes('"error_code":"unsupported_environment"'))).toBe(false);
    } else {
      await expect.poll(() => monitoring.some(body => body.includes('"error_code":"wasm_instantiation_failed"'))).toBe(true);
    }
  });
}
