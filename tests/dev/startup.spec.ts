import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

test.beforeEach(async ({ page }) => {
  // 広告・計測だけを遮断し、ローカルAPIとWASMは実物を使う。
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    return ["localhost", "127.0.0.1"].includes(url.hostname)
      && !/^\/(ingest|monitoring)(\/|$)/.test(url.pathname)
      ? route.continue() : route.abort();
  });
});

for (const kind of ["ticket", "pass", "ic-pass"]) {
  for (const months of kind === "ticket" ? [1] : [1, 3, 6]) {
    test(`事前計算なしの実API: ${kind} ${months}箇月`, async ({ page }) => {
      const endpoint = kind === "ic-pass" ? "icpass" : kind;
      const responsePromise = page.waitForResponse(response =>
        new URL(response.url()).pathname === `/api/split-${endpoint}`);
      await page.goto(`/split/auto/${kind}?${new URLSearchParams({
        from: "新茂原", to: "茂原", month: String(months),
      })}`);
      const response = await responsePromise;
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.error).toBeUndefined();
      expect(body.normal).toEqual(["新茂原", "茂原"]);
      expect(body.results).toContainEqual(["新茂原", "茂原"]);
      if (kind !== "ticket") {
        expect(new URL(response.url()).searchParams.get("months")).toBe(String(months));
      }
      await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
    });
  }
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
