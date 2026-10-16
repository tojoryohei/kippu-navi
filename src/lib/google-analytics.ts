import { deferThirdParty, type DeferredWindow } from "./deferred-third-party.ts";

interface GoogleAnalyticsWindow extends DeferredWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  location: { href: string };
  __googleAnalyticsInitialized?: string;
}

interface GoogleAnalyticsDocument {
  title: string;
  readyState: DocumentReadyState;
  head: { append(element: unknown): void };
  createElement(tagName: "script"): HTMLScriptElement;
  querySelector(selector: string): Element | null;
}

interface PageView {
  page_location: string;
  page_title: string;
}

interface AnalyticsState {
  status: "scheduled" | "loading" | "ready" | "failed";
  pending: PageView[];
}

const states = new WeakMap<GoogleAnalyticsWindow, AnalyticsState>();

export function initializeGoogleAnalytics(
  measurementId: string | undefined,
  targetWindow: GoogleAnalyticsWindow,
  targetDocument: GoogleAnalyticsDocument,
) {
  if (!measurementId || states.has(targetWindow)) return;
  const state: AnalyticsState = { status: "scheduled", pending: [] };
  states.set(targetWindow, state);
  deferThirdParty(() => {
    state.status = "loading";
    targetWindow.__googleAnalyticsInitialized = measurementId;
    targetWindow.dataLayer ||= [];
    targetWindow.gtag ||= function () {
      targetWindow.dataLayer?.push(arguments);
    };
    targetWindow.gtag("js", new Date());
    targetWindow.gtag("config", measurementId, { send_page_view: false });

    const script = targetDocument.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
    script.dataset.astroTransitionPersist = "google-analytics";
    script.dataset.astroExec = "";
    script.onload = () => {
      if (state.status !== "loading") return;
      state.status = "ready";
      // 待機中の遷移先ではなく、各ページビュー発生時のURLとタイトルを送る。
      for (const pageView of state.pending) targetWindow.gtag?.("event", "page_view", pageView);
      state.pending = [];
    };
    script.onerror = () => {
      state.status = "failed";
      state.pending = [];
    };
    const placeholder = targetDocument.querySelector('[data-astro-transition-persist="google-analytics"]');
    if (placeholder) placeholder.replaceWith(script);
    else targetDocument.head.append(script);
  }, targetWindow, targetDocument);
}

export function trackGooglePageView(
  measurementId: string | undefined,
  targetWindow: GoogleAnalyticsWindow,
  targetDocument: GoogleAnalyticsDocument,
) {
  if (!measurementId) return;
  initializeGoogleAnalytics(measurementId, targetWindow, targetDocument);
  const state = states.get(targetWindow)!;
  const pageView = { page_location: targetWindow.location.href, page_title: targetDocument.title };
  if (state.status === "ready") {
    targetWindow.gtag?.("event", "page_view", pageView);
  } else if (state.status !== "failed") {
    state.pending.push(pageView);
    if (state.pending.length > 100) state.pending.shift();
  }
}
