import { CacheProvider } from "@emotion/react";
import createCache from "@emotion/cache";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

// react-selectの外観はglobals.cssで配信する。実行時のstyle要素は生成しない。
const selectCache = createCache({ key: "calculator" });
selectCache.insert = () => undefined;

/** 実際のフォームを初期HTMLに含め、URLからの入力復元が反映されるまで操作を禁止する。 */
export default function CalculatorHydration({ hydrated, children }: { hydrated: boolean; children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const shell = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // 操作準備とは別に、初回commit完了を遷移ガードへ伝える。
    if (shell.current) shell.current.dataset.calculatorHydrated = "true";
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    // フォームの副作用で復元したURLパラメータが描画に反映されてから操作を許可する。
    // 計算エンジンのダウンロード完了は待たない。
    let revealFrame = 0;
    const frame = requestAnimationFrame(() => {
      revealFrame = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(revealFrame);
    };
  }, [hydrated]);

  return (
    <div ref={shell} className="relative" aria-busy={!ready} data-calculator-ready={ready} data-calculator-hydrated="false">
      <div inert={!ready} aria-hidden={!ready}>
        {/* ClientRouterの画面遷移でも外部CSSを使用する。 */}
        <CacheProvider value={selectCache}>{children}</CacheProvider>
      </div>
      {!ready && (
        <div className="sr-only" role="status">
          計算画面を読み込んでいます
        </div>
      )}
    </div>
  );
}
