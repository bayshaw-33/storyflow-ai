"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { UniverseGraph } from "@/components/universe/UniverseGraph";
import { DramaProject, readProjectsFromStorage } from "@/lib/projects";
import { buildUniverseGraph } from "@/lib/universe/graph";
import { useOS } from "@/lib/os/uiState";
import { useI18n } from "@/lib/i18n/useI18n";

export default function UniversesPage() {
  const router = useRouter();
  const os = useOS();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [projects, setProjects] = useState<DramaProject[]>([]);

  useEffect(() => {
    setProjects(readProjectsFromStorage());
  }, []);

  // PRICING → access control: Universe graph requires the PRO layer. No bypass.
  useEffect(() => {
    if (os.planReady && !os.access.universe) router.replace("/subscription");
  }, [os.planReady, os.access.universe, router]);

  const graph = useMemo(() => buildUniverseGraph(projects), [projects]);

  if (os.planReady && !os.access.universe) return null;

  return (
    <main className="universe-engine">
      <Link className="universe-brand" href="/" aria-label="Home">
        <KiikisLogo compact />
      </Link>
      <div className="universe-mini-panel universe-stats-panel">
        <span>{isZh ? "你的星云" : "YOUR NEBULA"}</span>
        <h2>{isZh ? "宇宙状态" : "Universe signal"}</h2>
        <div className="nebula-stat-grid">
          <strong>{projects.length}<span>{isZh ? "故事" : "stories"}</span></strong>
          <strong>{projects.filter((project) => project.finalScript?.trim()).length}<span>{isZh ? "点亮星球" : "lit planets"}</span></strong>
        </div>
      </div>
      <UniverseGraph graph={graph} />
    </main>
  );
}
