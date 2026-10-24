import { test, expect } from '@playwright/test';

type Request = { type: string; payload: { requestId: number } };
type Harness = { sent: Request[]; reply: (data: Record<string, unknown>, old?: boolean) => void };

for (const mode of ['online', 'offline']) {
  test(`途中追加・開閉維持・途中失敗・再検索: ${mode}`, async ({ page }) => {
    await page.route('**/api/split/auto/ticket*', route => mode === 'offline'
      ? route.abort()
      : route.fulfill({ json: { normal: ['新茂原','茂原'], results: [['新茂原','茂原']] } }));
    await page.addInitScript(() => {
      const requests: { request: Request; worker: { onmessage: ((e: MessageEvent) => void) | null } }[] = [];
      const harness: Harness = { sent: [], reply: (data, old) => {
        const entry = old ? requests[0] : requests.at(-1);
        entry?.worker.onmessage?.(new MessageEvent('message', { data: { ...data, requestId: entry.request.payload.requestId } }));
      } };
      Object.assign(window, { streamHarness: harness });
      window.Worker = class {
        onmessage: ((event: MessageEvent) => void) | null = null;
        constructor() { setTimeout(() => this.onmessage?.(new MessageEvent('message', { data: { type: 'ready', capability: 'ticket' } })), 0); }
        postMessage(request: Request) {
          requests.push({ request, worker: this });
          harness.sent.push(request);
        }
        terminate() {}
      } as unknown as typeof Worker;
    });
    const url = `/split/auto/ticket?${new URLSearchParams({from:'新茂原',to:'茂原'})}`;
    await page.goto(url);
    await expect.poll(() => page.evaluate(() => (window as unknown as {streamHarness:Harness}).streamHarness.sent.length)).toBeGreaterThan(0);
    const send = async (data: Record<string, unknown>, old = false) => page.evaluate(({data,old}) => (window as unknown as {streamHarness:Harness}).streamHarness.reply(data,old), {data,old});
    const normal = { totalAmount:160, segments:[{start:'新茂原',end:'茂原',path:['新茂原','茂原'],via:['外房'],totalEigyoKilo:29,result:{Fare:160}}] };
    const plan = (id: number) => ({ totalAmount:150,segments:[{start:`候補${id}`,end:'茂原',path:[`候補${id}`,'茂原'],via:['外房'],totalEigyoKilo:29,result:{Fare:150}}] });
    await send({type:'partial_result',result:{normal,results:[plan(1)]}});
    await expect(page.getByRole('heading',{name:'計算結果',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'計算中...',exact:true})).toBeDisabled();
    await send({type:'partial_result',result:{results:[plan(2)]}});
    await page.getByRole('button',{name:'他の1パターンを表示'}).click();
    await send({type:'partial_result',result:{results:[plan(3)]}});
    await expect(page.getByRole('heading',{name:/^最安分割パターン/})).toHaveCount(3);
    await expect(page.getByRole('button',{name:'他のパターンを閉じる'}).first()).toHaveAttribute('aria-expanded','true');
    await send({type:'error',error:'追加計算に失敗'});
    await expect(page.getByText('残りの計算に失敗しました。表示済みの結果は一部です')).toBeVisible();
    await expect(page.getByRole('heading',{name:/^最安分割パターン/})).toHaveCount(3);
    await page.getByRole('button',{name:'再計算',exact:true}).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as {streamHarness:Harness}).streamHarness.sent.length)).toBe(2);
    await send({type:'partial_result',result:{normal,results:[plan(99)]}},true);
    await expect(page.getByRole('heading',{name:'計算結果',exact:true})).toHaveCount(0);
    await send({type:'partial_result',result:{normal,results:[plan(1),plan(2)]}});
    await send({type:mode==='offline'?'success_calculate_optimal_split_ticket':'success',result:{streamed:true}});
    await expect(page.getByRole('button',{name:'乗車券を計算',exact:true})).toBeEnabled();
    await expect(page.getByRole('heading',{name:/^最安分割パターン/})).toHaveCount(1);
    await expect(page.getByRole('button',{name:'他の1パターンを表示'})).toHaveAttribute('aria-expanded','false');
  });
}
