import posthog from "posthog-js";

const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY;
const gaId = import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID;
let initialized = false;

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      person_profiles: "never",
      capture_pageview: false,
      disable_session_recording: true,
      autocapture: false,
      capture_performance: false,
    });
  }
  if (gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", gaId, { send_page_view: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.append(script);
  }
}

export const analytics = {
  capture(event: string, properties?: Record<string, unknown>) {
    initialize();
    if (posthogKey) posthog.capture(event, properties);
  },
};

// ClientRouterの初回表示・遷移完了ごとに一度呼ぶ。URLだけの更新は計算イベントで記録する。
export function trackPageView() {
  initialize();
  analytics.capture("$pageview", { $current_url: window.location.href });
  if (gaId)
    window.gtag?.("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
    });
}
