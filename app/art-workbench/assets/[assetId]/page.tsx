import { Suspense } from "react";
import ArtAssetDetail from "@/components/art/ArtAssetDetail";

export default function ArtAssetDetailPage() {
  return (
    <Suspense fallback={null}>
      <ArtAssetDetail />
    </Suspense>
  );
}
