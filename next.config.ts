import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/audio/jobs/*/download": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
  async redirects() {
    return [
      { source: "/universe", destination: "/universes", statusCode: 301 },
      { source: "/pricing", destination: "/subscription", statusCode: 301 },
      { source: "/billing", destination: "/settings/subscription", statusCode: 301 },
    ];
  },
};

export default nextConfig;
