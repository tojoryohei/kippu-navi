"use client";

import { useRef, useState } from "react";

export default function ScrollCarousel({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFirst, setIsFirst] = useState(true);
  const [isLast, setIsLast] = useState(false);

  const go = (dir: 1 | -1) =>
    ref.current?.scrollBy({ left: dir * ref.current.clientWidth, behavior: "smooth" });

  const handleScroll = () => {
    if (!ref.current) return;
    const { scrollLeft, clientWidth, scrollWidth } = ref.current;
    setIsFirst(scrollLeft < 10);
    setIsLast(scrollLeft + clientWidth >= scrollWidth - 10);
  };

  return (
    <div className="relative mt-4 max-w-sm mx-auto">
      <div
        ref={ref}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scroll-smooth rounded-2xl border border-slate-200 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <div className="flex justify-between mt-2 px-1">
        <button
          onClick={() => go(-1)}
          disabled={isFirst}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="前のステップへ"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          前へ
        </button>
        <button
          onClick={() => go(1)}
          disabled={isLast}
          className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-white border border-slate-200 shadow-sm text-xs font-semibold text-slate-600 hover:bg-slate-50 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label="次のステップへ"
        >
          次へ
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
