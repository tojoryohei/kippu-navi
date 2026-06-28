import type { NextConfig } from "next";

const R2_ORIGIN = 'https://assets.kippu-navi.com';
const isDev = process.env.NODE_ENV === 'development';
const unsafeEval = isDev ? "'unsafe-eval'" : "";

const nextConfig: NextConfig = {
  assetPrefix: process.env.ASSET_PREFIX || undefined,
  env: {
    ASSET_PREFIX: process.env.ASSET_PREFIX || '',
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'SAMEORIGIN',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
          },
          {
            key: 'Content-Security-Policy',
            value: `default-src 'self'; script-src 'self' ${unsafeEval} 'unsafe-inline' ${R2_ORIGIN} https://www.googletagmanager.com https://www.google-analytics.com https://static.cloudflareinsights.com https://*.posthog.com https://us-assets.i.posthog.com https://pagead2.googlesyndication.com https://adservice.google.com https://*.adtrafficquality.google; style-src 'self' 'unsafe-inline' ${R2_ORIGIN} https://fonts.googleapis.com https://us-assets.i.posthog.com; img-src 'self' data: blob: https: ${R2_ORIGIN}; font-src 'self' data: ${R2_ORIGIN} https://fonts.gstatic.com; connect-src 'self' ${R2_ORIGIN} https://*.posthog.com https://*.google-analytics.com https://*.adtrafficquality.google https://*.googletagmanager.com https://*.analytics.google.com https://*.g.doubleclick.net https://pagead2.googlesyndication.com; frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://docs.google.com https://*.adtrafficquality.google https://www.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; upgrade-insecure-requests;`,
          }
        ],
      },
    ];
  },
  async redirects() {
    return [
      {
        source: '/Bthesis_main.pdf',
        destination: 'https://assets.kippu-navi.com/documents/Bthesis_main.pdf',
        permanent: true,
      },
      {
        source: '/:path*',
        has: [
          {
            type: 'host',
            value: 'www.kippu-navi.com',
          },
        ],
        destination: 'https://kippu-navi.com/:path*',
        permanent: true,
      },
    ]
  },
  output: 'standalone',
  poweredByHeader: false,
};

export default nextConfig;
