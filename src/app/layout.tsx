import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@/app/globals.css";
import AdSense from "@/components/AdSense";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { PHProvider } from "@/app/providers/PostHogProvider";
import PostHogPageView from "@/app/providers/PostHogPageView";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#155dfc",
};

export const metadata: Metadata = {
  metadataBase: new URL('https://kippu-navi.com'),
  title: {
    default: "きっぷナビ",
    template: "%s | きっぷナビ",
  },
  description: "JRの最安分割運賃計算をするサイトです。",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "きっぷナビ",
    description: "JRの最安分割運賃計算をするサイトです。",
    url: "https://kippu-navi.com/",
    siteName: "きっぷナビ",
    locale: "ja_JP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'きっぷナビ',
    url: 'https://kippu-navi.com/',
  };

  return (
    <html lang="ja">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                if (typeof window !== 'undefined' && !window.__patched_worker__) {
                  var OriginalWorker = window.Worker;
                  var PatchedWorker = function(scriptURL, options) {
                    var urlString = scriptURL.toString();
                    var finalURL = scriptURL;
                    if (urlString.indexOf('http') === 0 && urlString.indexOf(window.location.origin) !== 0) {
                      var blobCode = 'importScripts(' + JSON.stringify(urlString) + ');';
                      var blob = new Blob([blobCode], { type: 'application/javascript' });
                      finalURL = URL.createObjectURL(blob);
                    }
                    return new OriginalWorker(finalURL, options);
                  };
                  PatchedWorker.prototype = OriginalWorker.prototype;
                  window.Worker = PatchedWorker;
                  window.__patched_worker__ = true;
                }
              })();
            `
          }}
        />
        <link rel="icon" href="https://assets.kippu-navi.com/icons/favicon.ico" sizes="any" />
        <link rel="apple-touch-icon" href="https://assets.kippu-navi.com/icons/apple-touch-icon.png" />
        <link rel="apple-touch-icon-precomposed" href="https://assets.kippu-navi.com/icons/apple-touch-icon-precomposed.png" />
      </head>
      <PHProvider>
        <body className={`flex flex-col min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden ${geistSans.variable} ${geistMono.variable} antialiased`}>
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
          />
          <PostHogPageView />
          {gaId && <GoogleAnalytics gaId={gaId} />}
          <AdSense />
          <Header />
          <main className="grow">{children}</main>
          <Footer />
          <ScrollToTopButton />
        </body>
      </PHProvider>
    </html>
  );
}
