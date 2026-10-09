import { NonceProvider } from "react-select";
import { useEffect, useState, type ReactNode } from "react";

/** 実際のフォームを初期HTMLに含め、URLからの入力復元が反映されるまで操作を禁止する。 */
export default function CalculatorHydration({ hydrated, children }: { hydrated: boolean; children: ReactNode }) {
  const [ready, setReady] = useState(false);

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
    <div className="relative" aria-busy={!ready} data-calculator-ready={ready}>
      <div inert={!ready} aria-hidden={!ready}>
        {/* ページ遷移後の初期HTMLも正常に初期化できるよう、Emotionのキャッシュをフォーム内に閉じる。 */}
        <NonceProvider cacheKey="calculator" nonce="">{children}</NonceProvider>
      </div>
      {!ready && (
        <div className="sr-only" role="status">
          計算画面を読み込んでいます
        </div>
      )}
    </div>
  );
}
