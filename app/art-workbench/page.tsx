"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ArtWorkbench from "@/components/art/ArtWorkbench";
import { resolveArtWorkbenchEntry } from "@/lib/client/v2/navigation/resolver";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";
import { LegacyEntryNotice } from "@/components/v2/navigation/LegacyEntryNotice";

function ArtWorkbenchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entry = resolveArtWorkbenchEntry(searchParams);
  const projectId = entry.kind === "project" ? entry.projectId : null;
  const workId = entry.kind === "project" ? entry.workId : null;
  const unitId = entry.kind === "project" ? entry.unitId : null;

  // P1-06：解析失败停留本页（保留 projectId），不再甩回新建选择态
  const [failed, setFailed] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const retry = useCallback(() => {
    setFailed(false);
    setReason(null);
    setRetryToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setFailed(false);
    setReason(null);
    resolveUnifiedWorkbenchRoute({ projectId, workId, tab: "art", unitId })
      .then((href) => {
        if (!cancelled) router.replace(href);
      })
      .catch((error) => {
        if (cancelled) return;
        setReason(error instanceof Error ? error.message : null);
        setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, router, unitId, workId, retryToken]);

  if (entry.kind === "standalone") return <ArtWorkbench />;
  if (failed) return <LegacyEntryNotice kind="failed" projectId={projectId} message={reason} onRetry={retry} />;
  return <main className="cosmic-page" aria-busy="true" />;
}

export default function ArtWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" aria-busy="true" />}>
      <ArtWorkbenchRedirect />
    </Suspense>
  );
}
