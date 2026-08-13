"use client";

// K2-T-10 举报与争议入口
// 提交举报、查看争议状态与管理员处理记录。争议状态对用户明确可见（PRD §9.6）。

import { Suspense } from "react";
import { ReportAndDispute } from "@/components/v2/licensing/ReportAndDispute";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function DisputesPage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <ReportAndDispute />
    </Suspense>
  );
}
