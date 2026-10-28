let installed = false;
let sequence = 0;
let navigation: Record<string, unknown> | undefined;

export function initializeBrowserDiagnostics() {
  if (installed || typeof document === "undefined") return;
  installed = true;
  document.addEventListener("astro:before-preparation", event => {
    const transition = event as Event & { from?: URL; to?: URL; navigationType?: string };
    navigation = { id: ++sequence, from: transition.from?.href, to: transition.to?.href, type: transition.navigationType, startedAt: performance.now(), phase: "before-preparation", completed: false };
  });
  for (const phase of ["after-preparation", "before-swap", "after-swap", "page-load"]) {
    document.addEventListener(`astro:${phase}`, () => {
      if (navigation) navigation = { ...navigation, phase, completed: phase === "page-load", elapsedMs: Math.round(performance.now() - Number(navigation.startedAt)) };
    });
  }
}

export function browserDiagnostics() {
  return {
    visibility: typeof document === "undefined" ? undefined : document.visibilityState,
    online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    workerSupported: typeof Worker !== "undefined",
    webAssemblySupported: typeof WebAssembly !== "undefined",
    navigation: navigation && { ...navigation },
  };
}
