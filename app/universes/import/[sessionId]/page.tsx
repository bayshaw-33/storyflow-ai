"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UniverseImportReview } from "@/components/v2/universe-import/UniverseImportReview";

function ImportReviewPageInner() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("sessionId");
  if (!sessionId) {
    return (
      <main className="cosmic-page" style={{ padding: 40 }}>
        <div role="alert" style={{ border: "1px solid rgba(224,120,74,0.4)", borderRadius: 12, padding: 16, color: "#e0a44a" }}>
          缺少 sessionId。请从 Universe 列表的“进行中的导入”进入。
        </div>
      </main>
    );
  }
  return (
    <main className="cosmic-page" style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
      <UniverseImportReview sessionId={sessionId} />
    </main>
  );
}

export default function UniverseImportReviewPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" />}>
      <ImportReviewPageInner />
    </Suspense>
  );
}
