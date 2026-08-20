"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";

function ArtWorkbenchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const workId = searchParams.get("workId");
  const unitId = searchParams.get("unitId") ?? searchParams.get("sourceUnitId");

  useEffect(() => {
    if (!projectId) {
      router.replace("/production?mode=art");
      return;
    }
    void resolveUnifiedWorkbenchRoute({ projectId, workId, tab: "art", unitId })
      .then((href) => router.replace(href))
      .catch(() => router.replace("/projects/new-v2"));
  }, [projectId, router, unitId, workId]);

  return <main className="cosmic-page" aria-busy="true" />;
}

export default function ArtWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" aria-busy="true" />}>
      <ArtWorkbenchRedirect />
    </Suspense>
  );
}
