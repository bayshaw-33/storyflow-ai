"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";
import { useI18n } from "@/lib/i18n/useI18n";

export function DirectorPageClient() {
  const params = useSearchParams();
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const projectId = params.get("projectId");
  const workId = params.get("workId");
  const unitId = params.get("unitId") ?? params.get("sourceUnitId");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setError("");
    resolveUnifiedWorkbenchRoute({ projectId, workId, unitId, tab: "storyboard" })
      .then(href => { if (!cancelled) router.replace(`${href}&view=motion`); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : "Unable to open project."); });
    return () => { cancelled = true; };
  }, [projectId, workId, unitId, router, attempt]);

  return (
    <main className="cosmic-page" aria-busy={Boolean(projectId && !error)}>
      <h1>{isZh ? "白模预演" : "White-model previs"}</h1>
      <p>{isZh ? "白模预演已统一到制作工作台：分镜 → 运动预览 → 打开白模预演。" : "Open previs in Production: Storyboard → Motion preview → Open previs."}</p>
      {error ? <><p role="alert">{error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{isZh ? "重试" : "Retry"}</button></> : projectId ? <p role="status">{isZh ? "正在打开项目…" : "Opening project…"}</p> : null}
      <Link href="/production">{isZh ? "打开制作工作台" : "Open production workspace"}</Link>
    </main>
  );
}
