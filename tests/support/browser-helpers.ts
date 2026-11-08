import { expect, type Locator, type Page, type Request } from '@playwright/test';

// fixtureが診断ログで「意図した遮断」を区別するための記録。リクエストの寿命に合わせて破棄する。
export const blockedRequests = new WeakMap<Request, string>();

export async function blockExternalServices(page: Page) {
  await page.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    if (!local || /^\/(ingest|monitoring)(\/|$)/.test(url.pathname)) {
      blockedRequests.set(request, 'テストで広告・計測などの外部サービスを遮断');
      return route.abort();
    }
    // 後続の個別ルートも使えるようにし、APIやWASMの応答はここでは変更しない。
    return route.fallback();
  });
}

export async function selectStation(page: Page, input: Locator, name: string) {
  await input.fill(name);
  // 候補にはかなも表示される。駅名部分の完全一致で「茂原」と「新茂原」を区別する。
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // eslint-disable-next-line security/detect-non-literal-regexp -- 駅名を正規表現としてエスケープ済み
  const option = page.getByRole('option', { name: new RegExp(`(?:^|\\s)${escaped}$`) });
  await expect(option).toHaveCount(1);
  await option.click();
  await expect(input).toHaveValue(name);
}
