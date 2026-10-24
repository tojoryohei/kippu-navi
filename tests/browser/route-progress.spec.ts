import { test, expect } from "@playwright/test";

type Reply = { type: string; requestId?: number; phase?: string; completed?: number; total?: number };
type Harness = { replies: Reply[]; sent: { type: string; payload: { requestId: number } }[]; reply: (data: Record<string, unknown>) => void };

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
  await reply({ type: "progress", phase: "calculating", completed: 6, total: 6 });
  await expect(bar).toHaveAttribute("value", "100");
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
  await reply({ type: "progress", phase: "organizing", completed: 6, total: 6 });
  await expect(page.getByRole("status")).toHaveText("結果を整理中…");
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toHaveCount(0);
  const fare = { departureStation: "新茂原", arrivalStation: "茂原", fare: 160, totalEigyoKilo: 29, printedViaLines: ["外房"], validDays: 1 };
  await reply({ type: "success_route_split_ticket", result: { time: 10, data: {
    normal: fare,
    results: [{ totalFare: 160, segments: [{ departureStation: "新茂原", arrivalStation: "茂原", fare }] }],
  } } });
  await expect(bar).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "乗車券を計算", exact: true })).toBeEnabled();
});
