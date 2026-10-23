import type { NextConfig } from "next";
import { realpathSync } from "node:fs";
import { relative } from "node:path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    // pnpm's public package directory is a symlink. Trace the real store file
    // so Vercel does not package a file beneath a symlinked directory.
    "/api/audio/jobs/*/download": [`./${relative(process.cwd(), realpathSync("./node_modules/ffmpeg-static/ffmpeg"))}`],
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
