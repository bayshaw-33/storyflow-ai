"use client";

/**
 * 剧本工作台入口 — Phase 3 Task 3.3.
 *
 * V2.2 Work（带 workId 参数）渲染 ScreenplayStudio（两栏 AI 剧本室）；
 * 旧 projectId 通过适配器解析 primary Work 后进入；无参数时回到
 * V2.2 八阶段入口。旧线性向导和小说工作台不再恢复。
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ScreenplayStudio } from "@/components/v2/screenplay-studio/ScreenplayStudio";

function ScriptWorkbenchInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const workId = searchParams.get("workId");
  const projectId = searchParams.get("projectId");
  const [resolving, setResolving] = useState(Boolean(projectId && !workId));
  const [resolveError, setResolveError] = useState<string | null>(null);

  // 旧 projectId → 适配器解析 primary Work（迁移期跳转，只读兼容）
  useEffect(() => {
    if (!projectId || workId) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`/api/v2/project-start/resolve-work?projectId=${encodeURIComponent(projectId)}`);
        const body = (await response.json().catch(() => ({}))) as { success?: boolean; workId?: string; error?: string };
        if (cancelled) return;
        if (response.ok && body.success && body.workId) {
          router.replace(`/script-workbench?workId=${encodeURIComponent(body.workId)}`);
        } else {
          setResolveError(body.error ?? "旧项目暂时无法解析出 Work，请从项目列表重新进入。");
          setResolving(false);
        }
      } catch {
        if (!cancelled) {
          setResolveError("旧项目解析失败，请从项目列表重新进入。");
          setResolving(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, workId, router]);

  useEffect(() => {
    if (workId || projectId || resolving || resolveError) return;
    router.replace("/projects/new-v2");
  }, [projectId, resolving, resolveError, router, workId]);

  if (workId) return <ScreenplayStudio />;
  if (resolving) return <main className="cosmic-page" style={{ padding: 40, color: "rgba(255,255,255,0.6)" }}>正在解析旧项目…</main>;
  if (resolveError) {
    return (
      <main className="cosmic-page" style={{ padding: 40 }}>
        <div role="alert" style={{ border: "1px solid rgba(224,120,74,0.4)", borderRadius: 12, padding: 16, color: "#e0a44a" }}>
          {resolveError}
        </div>
      </main>
    );
  }
  // 无参数：统一进入 V2.2 八模块入口，由用户选择剧本模块。
  return <main className="cosmic-page" aria-busy="true" />;
}

export default function ScriptWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" />}>
      <ScriptWorkbenchInner />
    </Suspense>
  );
}
