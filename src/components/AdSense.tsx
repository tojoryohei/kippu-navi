'use client';

import { useEffect, useState } from 'react';
import Script from 'next/script';

export default function AdSense() {
    const [loadAd, setLoadAd] = useState(false);

    useEffect(() => {
        const handleActivity = () => {
            setLoadAd(true);
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
        };

        window.addEventListener('scroll', handleActivity, { passive: true });
        window.addEventListener('mousemove', handleActivity, { passive: true });
        window.addEventListener('touchstart', handleActivity, { passive: true });

        return () => {
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
        };
    }, []);

    if (!loadAd) return null;

    return (
        <Script
      async
      src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1214458177768834"
    crossOrigin = "anonymous"
    strategy = "afterInteractive"
        />
  );
}