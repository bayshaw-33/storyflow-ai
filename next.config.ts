import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      {
        source: "/production-workbench",
        destination: "/production",
        permanent: true, // 301
      },
    ];
  },
};

export default nextConfig;
