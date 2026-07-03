import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    serverActions: {
      allowedOrigins: ['kippu-navi.com'],
    },
  },
};
export default nextConfig;
