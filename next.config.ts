import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins: ['kippu-navi.com'],
    },
  },
  async headers() {
    return [
      {
        source: '/',
        headers: [
          {
            key: 'Link',
            value: '</guide>; rel="service-doc", </sitemap.xml>; rel="sitemap"',
          },
        ],
      },
      {
        source: '/.well-known/traffic-advice',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/trafficadvice+json',
          },
        ],
      },
      {
        source: '/.well-known/apple-app-site-association',
        headers: [
          {
            key: 'Content-Type',
            value: 'application/json',
          },
        ],
      },
    ];
  },
};
export default nextConfig;
