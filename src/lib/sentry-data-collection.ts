import type { BrowserOptions } from "@sentry/browser";

// Keep the restrictive collection policy used before the Sentry 11 upgrade.
export const sentryDataCollection: NonNullable<BrowserOptions["dataCollection"]> = {
  userInfo: false,
  cookies: false,
  httpHeaders: false,
  httpBodies: [],
  urlQueryParams: true,
  graphQL: { document: false, variables: false },
  genAI: { inputs: false, outputs: false },
  databaseQueryData: false,
  queues: false,
  stackFrameVariables: true,
  frameContextLines: 7,
};
