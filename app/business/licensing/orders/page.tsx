"use client";

// K2-T-10 订单状态页入口
// 订单列表与详情：支付状态、退款 / 取消入口、订单证据、Grant 状态（PRD §9.6 验收）。

import { Suspense } from "react";
import { OrderStatus } from "@/components/v2/licensing/OrderStatus";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function OrdersPage() {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <OrderStatus />
    </Suspense>
  );
}
