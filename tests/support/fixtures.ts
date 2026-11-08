import { test as base, type BrowserContext, type Request, type Response, type WebError } from '@playwright/test';
import { blockedRequests } from './browser-helpers';

type DiagnosticEvent = {
  kind: 'pageerror' | 'requestfailed' | 'http-error';
  url?: string;
  message?: string;
  status?: number;
  expectedReason?: string;
};
type ExpectedFailure = {
  kind: DiagnosticEvent['kind'];
  url?: RegExp;
  message?: RegExp;
  status?: number;
  reason: string;
};
type Diagnostics = {
  expectFailure: (failure: ExpectedFailure) => void;
  observe: (context: BrowserContext) => () => void;
};

// g/y付きパターンでも毎イベント同じ条件で照合する。
function matches(pattern: RegExp | undefined, value: string | undefined) {
  if (!pattern) return true;
  pattern.lastIndex = 0;
  return pattern.test(value ?? '');
}

export const test = base.extend<{ diagnostics: Diagnostics }>({
  diagnostics: [async ({}, runFixture, testInfo) => {
    const events: DiagnosticEvent[] = [];
    const expected: ExpectedFailure[] = [];
    const cleanups: Array<() => void> = [];
    let dropped = 0;
    const record = (event: DiagnosticEvent) => {
      if (events.length < 500) events.push(event);
      else dropped++;
    };
    await runFixture({
      expectFailure: failure => expected.push(failure),
      observe(context) {
        const onError = (error: WebError) => record({
          kind: 'pageerror', url: error.page()?.url(), message: error.error().stack ?? error.error().message,
        });
        const onFailed = (request: Request) => record({
          kind: 'requestfailed', url: request.url(), message: request.failure()?.errorText,
          expectedReason: blockedRequests.get(request),
        });
        const onResponse = (response: Response) => {
          if (response.status() >= 400) record({ kind: 'http-error', url: response.url(), status: response.status() });
        };
        context.on('weberror', onError);
        context.on('requestfailed', onFailed);
        context.on('response', onResponse);
        const cleanup = () => {
          context.off('weberror', onError);
          context.off('requestfailed', onFailed);
          context.off('response', onResponse);
        };
        cleanups.push(cleanup);
        return cleanup;
      },
    });
    for (const cleanup of cleanups) cleanup();
    if (testInfo.status !== testInfo.expectedStatus) {
      for (const event of events) {
        const match = expected.find(rule => rule.kind === event.kind
          && matches(rule.url, event.url)
          && matches(rule.message, event.message)
          && (rule.status === undefined || rule.status === event.status));
        event.expectedReason ??= match?.reason;
      }
      await testInfo.attach('browser-diagnostics', {
        body: JSON.stringify({ events, dropped, expectedFailures: expected.map(rule => ({
          ...rule, url: rule.url?.toString(), message: rule.message?.toString(),
        })) }, null, 2),
        contentType: 'application/json',
      });
    }
  }, { auto: true }],
  context: async ({ context, diagnostics }, runFixture) => {
    const stop = diagnostics.observe(context);
    try { await runFixture(context); } finally { stop(); }
  },
});

export { expect } from '@playwright/test';
export type { Page } from '@playwright/test';
