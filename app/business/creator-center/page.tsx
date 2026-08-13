"use client";

// K2-T-10 创建者中心入口
// 聚合创建者收益账本（EarningsLedger）与资产 / 订单 / 争议入口。
// 收益结算明确标注为人工（PRD §9.6 强制）。

import { Suspense } from "react";
import { CreatorCenterClient } from "@/components/v2/creator-center/CreatorCenterClient";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function CreatorCenterPage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <CreatorCenterClient />
    </Suspense>
  );
}
