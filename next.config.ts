import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
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
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/api/:path*',
          destination: 'http://127.0.0.1:8080/api/:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;
