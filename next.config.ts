import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
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
};

export default nextConfig;
