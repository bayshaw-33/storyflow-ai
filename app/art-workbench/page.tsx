"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ArtWorkbench from "@/components/art/ArtWorkbench";
import { resolveArtWorkbenchEntry } from "@/lib/client/v2/navigation/resolver";
import { resolveUnifiedWorkbenchRoute } from "@/lib/client/v2/unified-workbench/api";

function ArtWorkbenchRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entry = resolveArtWorkbenchEntry(searchParams);
  const projectId = entry.kind === "project" ? entry.projectId : null;
  const workId = entry.kind === "project" ? entry.workId : null;
  const unitId = entry.kind === "project" ? entry.unitId : null;

  useEffect(() => {
    if (!projectId) return;
    void resolveUnifiedWorkbenchRoute({ projectId, workId, tab: "art", unitId })
      .then((href) => router.replace(href))
      .catch(() => router.replace("/projects/new-v2"));
  }, [projectId, router, unitId, workId]);

  return entry.kind === "standalone"
    ? <ArtWorkbench />
    : <main className="cosmic-page" aria-busy="true" />;
}

export default function ArtWorkbenchPage() {
  return (
    <Suspense fallback={<main className="cosmic-page" aria-busy="true" />}>
      <ArtWorkbenchRedirect />
    </Suspense>
  );
}
