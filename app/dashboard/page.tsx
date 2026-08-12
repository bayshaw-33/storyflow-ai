"use client";

// Kiikis 2.0 首页：指挥中心入口
// 不再是项目列表 + 创建向导，而是「我正在做什么、下一步做什么」的指挥面板。
// 四种状态（加载 / 空 / 错误 / 未登录）由 DashboardClient 内部管理。
// useSearchParams 需要 Suspense 边界，否则整页 deopt。

import { Suspense } from "react";
import { DashboardClient } from "@/components/v2/dashboard/DashboardClient";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function DashboardPage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <DashboardClient />
    </Suspense>
  );
}
