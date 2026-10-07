import { test, expect } from "@playwright/test";

type Reply = { type: string; requestId?: number; phase?: string; completed?: number; total?: number };
type Harness = { replies: Reply[]; sent: { type: string; payload: { requestId: number } }[]; reply: (data: Record<string, unknown>) => void };

for (const kind of ["ticket", "pass"]) {
  test(`経路入力 ${kind}: WASMから進捗を受け取り最終結果まで完了する`, async ({ page }) => {
    await page.route("**/*", route => {
      const url = new URL(route.request().url());
      return ["localhost", "127.0.0.1"].includes(url.hostname) ? route.continue() : route.abort();
    });
    await page.addInitScript(() => {
      const Original = window.Worker;
      const replies: Reply[] = [];
      Object.assign(window, { progressHarness: { replies } });
      window.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          this.addEventListener("message", e => replies.push(e.data));
        }
      };
    });
    await page.goto(`/split/route/${kind}?${new URLSearchParams({ route: "東京[東海道]熱海", mode: "normal", maxSplits: "1" })}`);
    await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible({ timeout: 60_000 });
    const replies = await page.evaluate(() => (window as unknown as { progressHarness: Harness }).progressHarness.replies);
    const result = replies.find(e => e.type === `success_route_split_${kind}`)!;
    expect(result).toBeTruthy();
    const progress = replies.filter(e => e.type === "progress" && e.requestId === result.requestId);
    expect(progress[0].phase).toBe("exploring");
    const dp = progress.filter(e => e.phase === "calculating");
    expect(dp.length).toBeGreaterThanOrEqual(2);
    if (kind === "ticket") expect(dp.some(e => e.completed! > 0 && e.completed! < e.total!)).toBe(true);
    expect(dp[0].completed).toBe(0);
    expect(dp.at(-1)!.completed).toBe(dp[0].total);
    expect(dp[0].total).toBeGreaterThan(0);
    for (let i = 1; i < dp.length; i++) {
      expect(dp[i].total).toBe(dp[0].total);
      expect(dp[i].completed!).toBeGreaterThanOrEqual(dp[i - 1].completed!);
    }
    expect(progress.at(-1)!.phase).toBe("organizing");
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });
}

test("準備・探索・割合と件数・整理・エラー・再計算の表示", async ({ page }) => {
  await page.addInitScript(() => {
    const harness: Harness = { replies: [], sent: [], reply: () => {} };
    Object.assign(window, { progressHarness: harness });
    window.Worker = class {
      onmessage: ((event: MessageEvent) => void) | null = null;
      constructor() { harness.reply = data => this.onmessage?.(new MessageEvent("message", { data })); }
      postMessage(message: { type: string; payload: { requestId: number } }) { harness.sent.push(message); }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原", mode: "normal" })}`);
  const bar = page.getByRole("progressbar", { name: "分割計算の進捗" });
  await expect(page.getByRole("status")).toHaveText("計算の準備中…");
  await expect(bar).not.toHaveAttribute("value");
  await page.evaluate(() => (window as unknown as { progressHarness: Harness }).progressHarness.reply({ type: "ready", capability: "ticket" }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { progressHarness: Harness }).progressHarness.sent.some(e => e.type === "calculateRouteSplitTicket"))).toBe(true);
  const reply = async (data: Record<string, unknown>, old = false) => page.evaluate(({ data, old }) => {
    const h = (window as unknown as { progressHarness: Harness }).progressHarness;
    const requests = h.sent.filter(e => e.type === "calculateRouteSplitTicket");
    h.reply({ ...data, requestId: (old ? requests[0] : requests.at(-1))!.payload.requestId });
  }, { data, old });
  await reply({ type: "progress", phase: "exploring", completed: 0, total: 0 });
  await expect(page.getByRole("status")).toHaveText("経路を探索中…");
  await expect(bar).not.toHaveAttribute("value");
  await reply({ type: "progress", phase: "calculating", completed: 420, total: 1000 });
  await expect(bar).toHaveAttribute("value", "42");
  await expect(page.getByText("42%（420／1,000件）", { exact: true })).toBeVisible();
  await bar.locator("..").screenshot({ path: test.info().outputPath("route-progress.png") });
  await reply({ type: "progress", phase: "organizing", completed: 1000, total: 1000 });
  await expect(page.getByRole("status")).toHaveText("結果を整理中…");
  await expect(bar).not.toHaveAttribute("value");
  await reply({ type: "error", error: "経路が重複しています。" });
  await expect(bar).toHaveCount(0);
  await page.getByRole("button", { name: "乗車券を計算", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("計算の準備中…");
  await reply({ type: "progress", phase: "calculating", completed: 999, total: 1000 }, true);
  await expect(bar).not.toHaveAttribute("value");
  await reply({ type: "progress", phase: "calculating", completed: 0, total: 6 });
  await expect(bar).toHaveAttribute("value", "0");
});
