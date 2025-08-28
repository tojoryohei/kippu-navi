import { GoogleTagManager } from '@next/third-parties/google'
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Header from '@/components/Header';

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
  return (
    <html lang="ja">
      <GoogleTagManager gtmId="G-TXTRWDDZ33" />
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Header />
        {children}
      </body>
    </html>
  );
}
