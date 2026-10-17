export type DeferredWindow = Pick<Window, "requestAnimationFrame" | "setTimeout" | "clearTimeout" | "requestIdleCallback" | "cancelIdleCallback" | "addEventListener" | "removeEventListener"> & {
  performance?: Pick<Performance, "now" | "getEntriesByName">;
  PerformanceObserver?: typeof PerformanceObserver;
};

/** FCPから1秒とloadを待ち、第三者スクリプトを別々のタスクで起動する。 */
export function deferThirdParty(start: () => void, targetWindow: DeferredWindow, targetDocument: Pick<Document, "readyState">) {
  let started = false;
  let anchored = false;
  let minimumElapsed = false;
  let framesReady = false;
  let loaded = targetDocument.readyState === "complete";
  let observer: PerformanceObserver | undefined;
  let deadline: number | undefined;
  let minimum: number | undefined;
  let idle: number | undefined;
  let fallback: number | undefined;
  const run = () => {
    if (started) return;
    started = true;
    targetWindow.clearTimeout(deadline);
    targetWindow.clearTimeout(minimum);
    targetWindow.clearTimeout(fallback);
    if (idle !== undefined) targetWindow.cancelIdleCallback(idle);
    targetWindow.removeEventListener("load", afterLoad);
    observer?.disconnect();
    start();
  };
  const schedule = () => {
    if (started || !minimumElapsed || !framesReady || !loaded || idle !== undefined || fallback !== undefined) return;
    if (typeof targetWindow.requestIdleCallback === "function") {
      idle = targetWindow.requestIdleCallback(run, { timeout: 5000 });
    } else {
      fallback = targetWindow.setTimeout(run, 0);
    }
  };
  const afterLoad = () => { loaded = true; schedule(); };
  const anchor = (paintTime: number, wait: number) => {
    if (started || anchored) return;
    anchored = true;
    observer?.disconnect();
    const elapsed = (targetWindow.performance?.now() ?? paintTime) - paintTime;
    // loadやアイドルが来なくてもFCPから5秒で開始する。処理中のタスクは中断しない。
    deadline = targetWindow.setTimeout(run, Math.max(0, 5000 - elapsed));
    const remaining = Math.max(0, wait - elapsed);
    if (remaining === 0) { minimumElapsed = true; schedule(); }
    else minimum = targetWindow.setTimeout(() => { minimumElapsed = true; schedule(); }, Math.ceil(remaining));
  };
  let observesPaint = false;
  try {
    const Observer = targetWindow.PerformanceObserver;
    if (Observer?.supportedEntryTypes.includes("paint") && targetWindow.performance) {
      observer = new Observer(list => {
        const paint = list.getEntries().find(entry => entry.name === "first-contentful-paint");
        if (paint) anchor(paint.startTime, 1000);
      });
      observer.observe({ type: "paint", buffered: true });
      observesPaint = true;
      const paint = targetWindow.performance.getEntriesByName("first-contentful-paint")[0];
      if (paint) anchor(paint.startTime, 1000);
    }
  } catch {
    // Paint Timing非対応環境では従来の描画機会とload待機を利用する。
    observer?.disconnect();
    observesPaint = false;
  }
  if (!loaded) targetWindow.addEventListener("load", afterLoad, { once: true });
  targetWindow.requestAnimationFrame(() => {
    if (!observesPaint) anchor(targetWindow.performance?.now() ?? 0, 0);
    targetWindow.requestAnimationFrame(() => {
      if (started) return;
      framesReady = true;
      schedule();
    });
  });
}

const scheduledAds = new WeakSet<Window>();

export function scheduleAds(targetWindow: Window, targetDocument: Document) {
  if (scheduledAds.has(targetWindow)) return;
  scheduledAds.add(targetWindow);
  deferThirdParty(() => {
    const script = targetDocument.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1214458177768834";
    // ClientRouterによる削除・再挿入で広告を二重起動しない。
    script.dataset.astroTransitionPersist = "adsense";
    script.dataset.astroExec = "";
    const placeholder = targetDocument.querySelector('[data-astro-transition-persist="adsense"]');
    if (placeholder) placeholder.replaceWith(script);
    else targetDocument.head.append(script);
  }, targetWindow, targetDocument);
}
