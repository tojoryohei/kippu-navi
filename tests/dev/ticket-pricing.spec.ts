import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    await page.route('**/*', route => {
        const url = new URL(route.request().url());
        return ['127.0.0.1', 'localhost'].includes(url.hostname) && !/^\/(ingest|monitoring)(\/|$)/.test(url.pathname) ? route.continue() : route.abort();
    });
});

test('小児と割引の選択・無効化・URL復元を実WASMで確認する', async ({ page }) => {
    await page.goto(`/fare/ticket?${new URLSearchParams({ route: '東京[東海道]品川', mode: 'normal' })}`);
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeHidden();
    await page.getByText('詳細オプション', { exact: true }).click();
    const result = page.getByRole('heading', { name: '計算結果', exact: true });
    await expect(result).toBeVisible();
    const amount = page.getByText(/^¥[\d,]+$/, { exact: true });
    await expect(amount).toBeVisible();
    const adult = Number((await amount.textContent())!.replace(/[^\d]/g, ''));
    expect(adult).toBeGreaterThan(0);
    await page.getByLabel('割引', { exact: true }).press('Enter');
    await page.getByRole('option', { name: '学割', exact: true }).click();
    await expect(result).toHaveCount(0);
    await page.getByRole('radio', { name: '小児', exact: true }).click();
    await expect(page.getByLabel('割引', { exact: true })).toHaveValue('割引なし');
    await page.getByLabel('割引', { exact: true }).press('Enter');
    await expect(page.getByRole('option', { name: '学割', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await page.getByLabel('割引', { exact: true }).press('Escape');
    await page.getByRole('button', { name: '運賃計算をする', exact: true }).click();
    await expect(result).toBeVisible();
    await expect(amount).toHaveText(`¥${(Math.floor(adult / 20) * 10).toLocaleString()}`);
    await page.getByLabel('割引', { exact: true }).press('Enter');
    await page.getByRole('option', { name: '東優4割', exact: true }).click();
    await expect(result).toHaveCount(0);
    await page.getByRole('button', { name: '運賃計算をする', exact: true }).click();
    await expect(result).toBeVisible();
    const expected = Math.floor(Math.floor(adult / 20) * 10 * 0.6 / 10) * 10;
    await expect(amount).toHaveText(`¥${expected.toLocaleString()}`);
    await expect(page.getByText("[東優4割53]", { exact: true })).toBeVisible();
    const url = new URL(page.url());
    expect(url.searchParams.get('passengerType')).toBe('child');
    expect(url.searchParams.get('discountId')).toBe('east40');
    await page.reload();
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeHidden();
    await page.getByText('詳細オプション', { exact: true }).click();
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeChecked();
    await expect(page.getByLabel('割引', { exact: true })).toHaveValue('東優4割');
    await expect(result).toBeVisible();
    await expect(amount).toHaveText(`¥${expected.toLocaleString()}`);
    await expect(page.getByText("[東優4割53]", { exact: true })).toBeVisible();
});

test('不適用の学割は通常運賃、分割・定期券には選択欄を出さない', async ({ page }) => {
    await page.goto(`/fare/ticket?${new URLSearchParams({ route: '東京[東海道]品川', discountId: 'student' })}`);
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeHidden();
    await page.getByText('詳細オプション', { exact: true }).click();
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
    const amount = page.getByText(/^¥[\d,]+$/, { exact: true });
    await expect(amount).toBeVisible();
    await expect(page.getByText("[学割]", { exact: true })).toHaveCount(0);
    const normal = await amount.textContent();
    await page.getByLabel('割引', { exact: true }).press('Enter');
    await page.getByRole('option', { name: '割引なし', exact: true }).click();
    await page.getByRole('button', { name: '運賃計算をする', exact: true }).click();
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
    await expect(amount).toHaveText(normal!);
    for (const path of ['/split/route/ticket', '/fare/pass', '/split/auto/ticket']) {
        await page.goto(`${path}?passengerType=child&discountId=east40`);
        await expect(page.getByLabel('割引', { exact: true })).toHaveCount(0);
    }
});

test('URLの未知値・小児不可割引は既定値へ正規化する', async ({ page }) => {
    await page.goto('/fare/ticket?passengerType=unknown&discountId=unknown');
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeHidden();
    await page.getByText('詳細オプション', { exact: true }).click();
    await expect(page.getByRole('radio', { name: '大人', exact: true })).toBeChecked();
    await expect(page.getByLabel('割引', { exact: true })).toHaveValue('割引なし');
    await page.goto('/fare/ticket?passengerType=child&discountId=student');
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeHidden();
    await page.getByText('詳細オプション', { exact: true }).click();
    await expect(page.getByRole('radio', { name: '小児', exact: true })).toBeChecked();
    await expect(page.getByLabel('割引', { exact: true })).toHaveValue('割引なし');
});

test('名古屋から新大阪の新幹線は通常モードで海優を適用する', async ({ page }) => {
    await page.goto(`/fare/ticket?${new URLSearchParams({ route: '名古屋[新幹線]新大阪', mode: 'normal', discountId: 'central20' })}`);
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
    await expect(page.getByText('[海優2割76]', { exact: true })).toBeVisible();
    const amount = page.getByText(/^¥[\d,]+$/, { exact: true });
    const discounted = Number((await amount.textContent())!.replace(/[^\d]/g, ''));
    await page.getByText('詳細オプション', { exact: true }).click();
    await page.getByLabel('割引', { exact: true }).press('Enter');
    await page.getByRole('option', { name: '割引なし', exact: true }).click();
    await page.getByRole('button', { name: '運賃計算をする', exact: true }).click();
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
    const adult = Number((await amount.textContent())!.replace(/[^\d]/g, ''));
    expect(discounted).toBe(Math.floor(adult * 80 / 1000) * 10);
});

test('最安で100キロを超える学割乗車券を採用し、金額と距離表を更新する', async ({ page }) => {
    await page.goto(`/fare/ticket?${new URLSearchParams({ route: '新横浜[新幹線]熱海[東海道]沼津', mode: 'normal', discountId: 'student' })}`);
    const amount = page.getByText(/^¥[\d,]+$/, { exact: true });
    await expect(amount).toHaveText('¥1,690');
    await expect(page.getByText('[学割]', { exact: true })).toHaveCount(0);
    await page.getByRole('radio', { name: /^最安 / }).check();
    await page.getByRole('button', { name: '運賃計算をする', exact: true }).click();
    await expect(amount).toHaveText('¥1,580');
    await expect(page.getByText('[学割]', { exact: true })).toBeVisible();
    await expect(page.getByText('片浜', { exact: true })).toBeVisible();
    const input = page.getByRole('table', { name: '入力経路の営業キロ・換算キロ（km）' });
    const corrected = page.getByRole('table', { name: '補正後の経路の営業キロ・換算キロ（km）' });
    await expect(input.getByRole('row').filter({ hasText: '営業キロ' }).getByRole('cell').last()).toHaveText('97.4');
    await expect(corrected.getByRole('row').filter({ hasText: '営業キロ' }).getByRole('cell').last()).toHaveText('101.5');
});
