// K2-T-10 下单确认页入口
// 资产摘要 + 授权范围（下单前可读，PRD §9.3）+ 支付方式 + 创建订单与 Usage Grant。
// 订单失败不会错误创建 Active Grant（PRD §9.6）。

import { Suspense } from "react";
import { CheckoutConfirm } from "@/components/v2/licensing/CheckoutConfirm";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ offerId: string }>;
}) {
  const { offerId } = await params;
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <CheckoutConfirm offerId={offerId} />
    </Suspense>
  );
}
