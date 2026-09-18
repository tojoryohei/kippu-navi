/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_WASM_VERSION?: string;
  readonly PUBLIC_POSTHOG_KEY?: string;
  readonly PUBLIC_SENTRY_DSN?: string;
}

declare const __WASM_VERSION__: string;
declare const __APP_VERSION__: string;
declare const __DEPLOY_COMMIT__: string;
declare const __DEPLOY_ENVIRONMENT__: string;
