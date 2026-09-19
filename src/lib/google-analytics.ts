interface GoogleAnalyticsWindow {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  location: { href: string };
  __googleAnalyticsInitialized?: string;
}

interface GoogleAnalyticsDocument {
  title: string;
  head: { append(element: unknown): void };
  createElement(tagName: string): { async: boolean; src: string };
}

export function initializeGoogleAnalytics(
  measurementId: string | undefined,
  targetWindow: GoogleAnalyticsWindow,
  targetDocument: GoogleAnalyticsDocument,
) {
  if (!measurementId || targetWindow.__googleAnalyticsInitialized === measurementId) return;
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
  targetDocument.head.append(script);
}

export function trackGooglePageView(
  measurementId: string | undefined,
  targetWindow: GoogleAnalyticsWindow,
  targetDocument: GoogleAnalyticsDocument,
) {
  if (!measurementId) return;
  initializeGoogleAnalytics(measurementId, targetWindow, targetDocument);
  targetWindow.gtag?.("event", "page_view", {
    page_location: targetWindow.location.href,
    page_title: targetDocument.title,
  });
}
