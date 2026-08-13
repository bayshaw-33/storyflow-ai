"use client";

// K2-T-10 授权管理主页入口
// 聚合 GrantManagement，提供跳转到 License Offer 编辑器、下单、订单状态、举报争议的入口。

import { Suspense } from "react";
import { LicensingPageClient } from "@/components/v2/licensing/LicensingPageClient";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function LicensingPage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <LicensingPageClient />
    </Suspense>
  );
}
