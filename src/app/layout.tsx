import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Geist_Mono } from "next/font/google";
import "@/app/globals.css";
import Script from "next/script";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import ScrollToTopButton from '@/components/ScrollToTopButton';
import { PHProvider } from "@/app/providers/PostHogProvider";
import PostHogPageView from "@/app/providers/PostHogPageView";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  subsets: ["latin"],
  display: "swap",
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
  description: "JR在来線の分割きっぷ（乗車券・定期券・IC定期券）の最安組み合わせを自動計算。発駅と着駅を入力するだけで、交通費の節約額がすぐにわかる無料Webツールです。",
  icons: {
    icon: "https://kippu-navi.com/favicon.ico",
    apple: [
      { url: "https://kippu-navi.com/apple-touch-icon.png" },
      { url: "https://kippu-navi.com/apple-touch-icon-precomposed.png", rel: "apple-touch-icon-precomposed" },
    ],
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "きっぷナビ",
    description: "JR在来線の分割きっぷ（乗車券・定期券・IC定期券）の最安組み合わせを自動計算。発駅と着駅を入力するだけで、交通費の節約額がすぐにわかる無料Webツールです。",
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
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`flex flex-col min-h-screen bg-slate-50 text-slate-900 overflow-x-hidden ${notoSansJP.variable} ${geistMono.variable} font-sans antialiased`}>
        <PHProvider>
          <PostHogPageView />
          {gaId && <GoogleAnalytics gaId={gaId} />}
          <Script
            async
            src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1214458177768834"
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
          <Header />
          <main className="grow">{children}</main>
          <Footer />
          <ScrollToTopButton />
        </PHProvider>
      </body>
    </html>
  );
}
