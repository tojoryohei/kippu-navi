"use client";

import { useState, useEffect } from "react";
import { HiArrowUp } from "react-icons/hi";
import { animateScroll as scroll } from "react-scroll";

export default function ScrollToTopButton() {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 300) {
                setShowScrollTop(true);
            } else {
                setShowScrollTop(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollToTop = () => {
        scroll.scrollToTop({
            duration: 500,
            smooth: "easeInOutQuad",
        });
    };

    return (
        <button
            type="button"
            onClick={scrollToTop}
            aria-label="ページの上部へ戻る"
            className={`
                fixed right-4 bottom-8 sm:right-8 sm:bottom-8 z-50
                flex items-center justify-center w-12 h-12 
                bg-blue-600/80 backdrop-blur-sm text-white rounded-full shadow-md 
                hover:bg-blue-600 hover:scale-105 active:scale-95
                transition-all duration-300
                ${showScrollTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}
            `}
        >
            <HiArrowUp className="text-xl" />
        </button>
    );
}
