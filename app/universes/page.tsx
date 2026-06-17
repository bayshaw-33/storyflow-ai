"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { UniverseGraph } from "@/components/universe/UniverseGraph";
import { DramaProject, readProjectsFromStorage } from "@/lib/projects";
import { buildUniverseGraph } from "@/lib/universe/graph";
import { useOS } from "@/lib/os/uiState";

export default function UniversesPage() {
  const router = useRouter();
  const os = useOS();
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
      <UniverseGraph graph={graph} />
    </main>
  );
}
