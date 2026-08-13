// K2-T-10 License Offer 编辑器入口
// 为资产配置授权条款：模板、用途、可见范围、商业条件、肖像保护（PRD §9.2）。

import { Suspense } from "react";
import { LicenseOfferEditor } from "@/components/v2/licensing/LicenseOfferEditor";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default async function LicenseOfferPage({
  params,
}: {
  params: Promise<{ assetId: string }>;
}) {
  const { assetId } = await params;
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <LicenseOfferEditor assetId={assetId} />
    </Suspense>
  );
}
