import { useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  document.addEventListener("astro:page-load", listener);
  // 同一pathname内の履歴移動ではDOM交換が省略される場合もある。
  window.addEventListener("popstate", listener);
  return () => {
    document.removeEventListener("astro:page-load", listener);
    window.removeEventListener("popstate", listener);
  };
}

export function useCalculatorLocation() {
  return useSyncExternalStore(
    subscribe,
    () => window.location.pathname + window.location.search,
    () => null,
  );
}

export function replaceCalculatorUrl(url: string) {
  // ClientRouterの履歴番号やスクロール情報を消さず、入力中のURLだけ更新する。
  window.history.replaceState(window.history.state, "", url);
}
