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
      {
        source: "/art-workbench",
        destination: "/production?mode=art",
        permanent: true, // 301（任务 2：美术工作台合并入制作工作台美术 Tab）
      },
    ];
  },
};

export default nextConfig;
