import { beforeEach, afterEach, expect, test, vi } from "vitest";

const posthog = vi.hoisted(() => ({ init: vi.fn(), capture: vi.fn() }));
vi.mock("posthog-js", () => ({ default: posthog }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("PUBLIC_POSTHOG_KEY", "test-key");
  vi.stubEnv("PUBLIC_GOOGLE_ANALYTICS_ID", "");
  vi.stubGlobal("window", {
    location: { href: "https://example.test/split/ticket?from=A&to=B" },
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("ClientRouterの各ページ表示を一度ずつ記録し、SDKは一度だけ初期化する", async () => {
  const { trackPageView } = await import("@/lib/analytics");
  trackPageView();
  window.location.href = "https://example.test/guide";
  trackPageView();
  expect(posthog.init).toHaveBeenCalledTimes(1);
  expect(posthog.init).toHaveBeenCalledWith(
    "test-key",
    expect.objectContaining({ api_host: "/ingest", capture_pageview: false }),
  );
  expect(posthog.capture.mock.calls).toEqual([
    [
      "$pageview",
      { $current_url: "https://example.test/split/ticket?from=A&to=B" },
    ],
    ["$pageview", { $current_url: "https://example.test/guide" }],
  ]);
});

test("キーを設定していない場合は計測を送信しない", async () => {
  vi.stubEnv("PUBLIC_POSTHOG_KEY", "");
  const { trackPageView, analytics } = await import("@/lib/analytics");
  trackPageView();
  analytics.capture("calculation_completed");
  expect(posthog.init).not.toHaveBeenCalled();
  expect(posthog.capture).not.toHaveBeenCalled();
});
