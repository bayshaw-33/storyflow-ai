import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/universe", destination: "/universes", statusCode: 301 },
      { source: "/pricing", destination: "/subscription", statusCode: 301 },
      { source: "/billing", destination: "/settings/subscription", statusCode: 301 },
    ];
  },
};

export default nextConfig;
