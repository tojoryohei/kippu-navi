import { test, expect } from "@playwright/test";

for (const month of [1, 3, 6]) {
  for (const route of ["東京[東北]盛岡[いわて銀河]目時[青い森鉄道]青森", "河原田[伊勢鉄道線]津"]) {
    test(`定期券${month}箇月で会社線を計算前に拒否する: ${route}`, async ({ page }) => {
      await page.route("**/*", route => {
        const url = new URL(route.request().url());
        if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname.startsWith("/ingest/")) return route.abort();
        return route.continue();
      });
      await page.addInitScript(() => {
        const OriginalWorker = window.Worker;
        const requests: { type: string }[] = [];
        Object.assign(window, { validationTestRequests: requests });
        window.Worker = class extends OriginalWorker {
          postMessage(message: { type: string }) {
            requests.push(message);
            super.postMessage(message);
          }
        };
      });
      await page.goto(`/fare/pass?${new URLSearchParams({ route, month: String(month) })}`);
      await expect(page.getByText("定期券の計算で会社線は選択できません").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "運賃計算をする", exact: true })).toBeDisabled();
      const requests = await page.evaluate(() => (window as unknown as { validationTestRequests: { type: string }[] }).validationTestRequests);
      expect(requests.filter(request => request.type.startsWith("calculate"))).toEqual([]);
      await page.getByRole("button", { name: "乗車券", exact: true }).click();
      await expect(page.getByText("定期券の計算で会社線は選択できません")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "運賃計算をする", exact: true })).toBeEnabled();
      await page.getByRole("button", { name: "定期券", exact: true }).click();
      await expect(page.getByText("定期券の計算で会社線は選択できません").first()).toBeVisible();
      await expect(page.getByRole("button", { name: "運賃計算をする", exact: true })).toBeDisabled();
    });
  }
}
