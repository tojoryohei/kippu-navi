import type { NextConfig } from "next";

const R2_ORIGIN = 'https://assets.kippu-navi.com';

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
            value: `default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline' ${R2_ORIGIN} https://www.google-analytics.com https://www.googletagmanager.com https://pagead2.googlesyndication.com https://partner.googleadservices.com https://tpc.googlesyndication.com https://adservice.google.com; style-src 'self' 'unsafe-inline' ${R2_ORIGIN} https://fonts.googleapis.com; img-src 'self' data: blob: https: ${R2_ORIGIN}; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self' ${R2_ORIGIN} https://*.posthog.com https://*.firebaseio.com https://*.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com https://*.g.doubleclick.net https://pagead2.googlesyndication.com https://*.adtrafficquality.google; frame-src 'self' https://googleads.g.doubleclick.net https://tpc.googlesyndication.com https://docs.google.com; frame-ancestors 'self';`,
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
