import { GoogleAnalytics } from "@next/third-parties/google";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "きっぷナビ",
    template: "%s | きっぷナビ",
  },
  description: "JR乗車券の分割運賃計算をするサイトです。",
  metadataBase: new URL('https://kippu-navi.com'),
  openGraph: {
    title: "きっぷナビ",
    description: "JR乗車券の分割運賃計算をするサイトです。",
    url: "https://kippu-navi.com",
    siteName: "きっぷナビ",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID;
  return (
    <html lang="ja">
      <Script
        async
        src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1214458177768834"
        crossOrigin="anonymous"
        strategy="afterInteractive"
      />
      <body
        className={`flex flex-col min-h-screen ${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {gaId && <GoogleAnalytics gaId={gaId} />}
        <Header />
        <main className="grow">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
