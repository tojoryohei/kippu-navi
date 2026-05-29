"use client";

import { useState, useEffect, useRef } from "react";
import { HiArrowUp } from "react-icons/hi";

export default function ScrollToTopButton() {
    const [showScrollTop, setShowScrollTop] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);
    const footerRef = useRef<Element | null>(null);

    useEffect(() => {
        footerRef.current = document.querySelector("footer");

        let animationFrameId: number;

        const handleScroll = () => {
            animationFrameId = requestAnimationFrame(() => {
                setShowScrollTop(window.scrollY > 300);

                if (wrapperRef.current) {
                    let overlap = 0;

                    if (footerRef.current) {
                        const footerRect = footerRef.current.getBoundingClientRect();
                        overlap = Math.max(0, window.innerHeight - footerRect.top);
                    }

                    wrapperRef.current.style.transform = `translateY(-${overlap}px)`;
                }
            });
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        handleScroll();

        return () => {
            window.removeEventListener("scroll", handleScroll);
            cancelAnimationFrame(animationFrameId);
        };
    }, []);

    const scrollToTop = () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    };

    return (
        <div
            ref={wrapperRef}
            className="fixed right-4 sm:right-8 bottom-8 z-50 pointer-events-none"
        >
            <button
                type="button"
                onClick={scrollToTop}
                aria-label="ページの上部へ戻る"
                className={`
                    pointer-events-auto
                    flex items-center justify-center w-12 h-12 
                    bg-blue-600/80 backdrop-blur-sm text-white rounded-full shadow-md 
                    hover:bg-blue-600 hover:scale-105 active:scale-95
                    transition-all duration-300
                    ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'}
                `}
            >
                <HiArrowUp className="text-xl" />
            </button>
        </div>
    );
}
