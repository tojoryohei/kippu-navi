import { navigate } from "astro:transitions/client";

/** Astroのページ遷移後も、計算画面の現在位置を維持する。 */
export function navigatePreservingScroll(href: string) {
  if (typeof window === "undefined") {
    void navigate(href);
    return;
  }

  const left = window.scrollX;
  const top = window.scrollY;
  let restored = false;

  const restore = () => {
    if (restored) return;
    restored = true;
    document.removeEventListener("astro:page-load", restore);
    window.scrollTo(left, top);
  };

  document.addEventListener("astro:page-load", restore);
  void navigate(href).catch(() => {
    document.removeEventListener("astro:page-load", restore);
  });
}
