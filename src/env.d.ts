/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_WASM_VERSION?: string;
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_GOOGLE_ANALYTICS_ID?: string;
}

interface Window {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
}
