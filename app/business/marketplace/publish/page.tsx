"use client";

// K2-T-09 发布流程页入口
// 7 步分步表单：身份 / 主版本 / 说明 / 用途 / 可见范围 / 授权方式 / 权利声明。

import { Suspense } from "react";
import { PublishFlowClient } from "@/components/v2/marketplace/PublishFlowClient";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function PublishPage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <PublishFlowClient />
    </Suspense>
  );
}
