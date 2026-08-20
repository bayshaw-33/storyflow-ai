"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { parseUnifiedWorkbenchQuery } from "@/lib/contracts/v2/unified-workbench";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";

function LegacyProductionRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { projectId, workId, tab, unitId } = parseUnifiedWorkbenchQuery(searchParams);

  useEffect(() => {
    if (!projectId) {
      router.replace("/projects/new-v2");
      return;
    }
    void resolveUnifiedWorkbenchRoute({ projectId, workId, tab, unitId })
      .then((href) => router.replace(href))
      .catch(() => router.replace("/projects/new-v2"));
  }, [projectId, router, tab, unitId, workId]);

  return <main className="cosmic-page" aria-busy="true" />;
}

export default function ProductionWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" aria-busy="true" />}>
      <LegacyProductionRedirect />
    </Suspense>
  );
}
