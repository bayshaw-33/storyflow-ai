"use client";

// K2-T-09 市场列表页入口
// 演员与资产市场 Alpha：搜索、筛选、资产卡片、推荐可解释。

import { Suspense } from "react";
import { MarketplaceClient } from "@/components/v2/marketplace/MarketplaceClient";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function MarketplacePage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <MarketplaceClient />
    </Suspense>
  );
}
