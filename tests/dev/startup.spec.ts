import { test, expect } from "../support/fixtures";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { blockExternalServices, selectStation } from "../support/browser-helpers";

test.beforeEach(async ({ page }) => {
  // 広告・計測だけを遮断し、ローカルAPIとWASMは実物を使う。
  await blockExternalServices(page);
});

// 外房線 新茂原→茂原は2.9kmのJR東日本幹線、加算・バリアフリー料金なし。
// 乗車券: fare/east.goの第84条の3（1〜3km）、migration.spec.tsの¥160と照合。
// 定期: pass/infra/fareio/data/eastTrunkFares.jsonの3km欄。
// pass/route_split_test.goの同区間・隣接駅の分割なしケースと同じ条件。
for (const { kind, months, label, fare } of [
  { kind: "ticket", months: 1, label: "乗車券", fare: "¥160" },
  { kind: "pass", months: 3, label: "定期券３箇月", fare: "¥13,960" },
  { kind: "ic-pass", months: 6, label: "IC定期券６箇月", fare: "¥26,620" },
]) {
  test(`事前計算なしの実API: ${kind} ${months}箇月`, async ({ page }) => {
    const endpoint = kind;
    const response = await test.step("入力から実APIへ検索条件を渡す", async () => {
      if (kind === "ticket") {
        await page.goto('/split/auto/ticket');
        await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
        await selectStation(page, page.getByRole('combobox', { name: '乗車駅', exact: true }), '新茂原');
        await selectStation(page, page.getByRole('combobox', { name: '降車駅', exact: true }), '茂原');
      }
      const [response] = await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === `/api/split/auto/${endpoint}`),
        kind === 'ticket'
          ? page.getByRole('button', { name: '乗車券を計算', exact: true }).click()
          : page.goto(`/split/auto/${kind}?${new URLSearchParams({
            from: "新茂原", to: "茂原", months: String(months),
          })}`),
      ]);
      return response;
    });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.error).toBeUndefined();
    expect(body.normal).toEqual(["新茂原", "茂原"]);
    expect(body.results).toContainEqual(["新茂原", "茂原"]);
    if (kind !== "ticket") {
      expect(new URL(response.url()).searchParams.get("months")).toBe(String(months));
    }
    await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
    await test.step("券種・期間・発着駅と独立した期待金額を表示する", async () => {
      const normal = page.locator('section').filter({
        has: page.getByRole('heading', { name: `分割前の${label}`, exact: true }),
      });
      await expect(normal.getByText('新茂原', { exact: true })).toBeVisible();
      await expect(normal.getByText('茂原', { exact: true })).toBeVisible();
      await expect(normal.getByText(fare, { exact: true })).toBeVisible();
    });
  });
}

test("同じGoのランタイムで経路指定のWASM計算が完了する", async ({ page }) => {
  const goroot = execFileSync("go", ["env", "GOROOT"], { encoding: "utf8" }).trim();
  const runtime = [join(goroot, "lib/wasm/wasm_exec.js"), join(goroot, "misc/wasm/wasm_exec.js")].find(existsSync);
  expect(runtime).toBeTruthy();
  const responsePromise = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/engine/wasm_exec.js");
  await page.goto(`/fare/ticket?${new URLSearchParams({ route: "東京[東海道]品川", mode: "normal" })}`);
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  expect(await response.body()).toEqual(readFileSync(runtime!));
  await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
});
