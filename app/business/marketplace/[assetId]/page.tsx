"use client";

// K2-T-09 资产详情页入口
// 主版本预览、说明、允许/禁止用途、授权摘要、来源证据、肖像权利、创建者信息、举报/下架、调用入口。

import { Suspense } from "react";
import { AssetDetailClient } from "@/components/v2/marketplace/AssetDetailClient";

const fallbackStyle = {
  minHeight: "100dvh",
  padding: 24,
  background: "#070808",
  color: "#f4f7f8",
} as const;

export default function AssetDetailPage({ params }: { params: { assetId: string } }) {
  return (
    <Suspense fallback={<main style={fallbackStyle}>加载中...</main>}>
      <AssetDetailClient assetId={params.assetId} />
    </Suspense>
  );
}
