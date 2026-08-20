"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";

function ScriptWorkbenchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const workId = searchParams.get("workId");
  const unitId = searchParams.get("unitId") ?? searchParams.get("sourceUnitId");

  useEffect(() => {
    if (!projectId) {
      router.replace("/projects/new-v2");
      return;
    }
    void resolveUnifiedWorkbenchRoute({ projectId, workId, tab: "script", unitId })
      .then((href) => router.replace(href))
      .catch(() => router.replace("/projects/new-v2"));
  }, [projectId, router, unitId, workId]);

  return <main className="cosmic-page" aria-busy="true" />;
}

export default function ScriptWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" aria-busy="true" />}>
      <ScriptWorkbenchRedirect />
    </Suspense>
  );
}
