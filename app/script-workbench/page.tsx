"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";
import { LegacyEntryNotice } from "@/components/v2/navigation/LegacyEntryNotice";

function ScriptWorkbenchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId");
  const workId = searchParams.get("workId");
  const unitId = searchParams.get("unitId") ?? searchParams.get("sourceUnitId");

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
    resolveUnifiedWorkbenchRoute({ projectId, workId, tab: "script", unitId })
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

  if (!projectId) return <LegacyEntryNotice kind="no-project" />;
  if (failed) return <LegacyEntryNotice kind="failed" projectId={projectId} message={reason} onRetry={retry} />;
  return <main className="cosmic-page" aria-busy="true" />;
}

export default function ScriptWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" aria-busy="true" />}>
      <ScriptWorkbenchRedirect />
    </Suspense>
  );
}
