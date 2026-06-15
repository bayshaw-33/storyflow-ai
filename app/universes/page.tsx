"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { DramaProject, getCompletedStepCount, getWorkflowSteps, readProjectsFromStorage } from "@/lib/projects";

const tabs = ["Map", "Timeline", "Lore", "Characters", "Canon", "Assets"];

function getPlanetStatus(project: DramaProject, lit: boolean) {
  if (lit) return "Lit Planet";
  if (project.finalScript?.trim()) return "Final Script Planet";
  if (getCompletedStepCount(project) > 0) return "In Progress Planet";
  return "Draft Planet";
}

export default function UniversesPage() {
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [litIds, setLitIds] = useState<string[]>([]);
  const selected = projects.find((project) => project.id === selectedId) || projects[0] || null;

  useEffect(() => {
    const items = readProjectsFromStorage();
    setProjects(items);
    setSelectedId(items[0]?.id || "");
  }, []);

  const stats = useMemo(() => ({
    stories: projects.length,
    lit: projects.filter((project) => litIds.includes(project.id) || project.finalScript?.trim()).length,
    characters: projects.reduce((sum, project) => sum + project.characterCards.length, 0),
  }), [litIds, projects]);

  function lightPlanet(projectId: string) {
    setLitIds((current) => Array.from(new Set([...current, projectId])));
  }

  return (
    <main className="cosmic-page universe-map-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
        <nav>
          <Link href="/">Dashboard</Link>
          <Link href="/companions">Companions</Link>
          <Link href="/templates">Templates</Link>
          <Link href="/subscription">Pricing</Link>
          <Link href="/settings">Settings</Link>
        </nav>
      </header>

      <section className="universe-layout">
        <aside className="dashboard-sidebar universe-sidebar">
          <a className="active" href="#map">Map</a>
          <a href="#timeline">Timeline</a>
          <a href="#lore">Lore</a>
          <a href="#characters">Characters</a>
          <a href="#canon">Canon</a>
          <a href="#assets">Assets</a>
        </aside>

        <section className="galaxy-map-panel">
          <div className="universe-tabs">
            {tabs.map((tab, index) => <button className={index === 0 ? "active" : ""} key={tab}>{tab}</button>)}
          </div>
          <div className="galaxy-map" id="map">
            <span className="nebula-cloud" />
            {projects.length === 0 ? (
              <div className="empty-galaxy">
                <h1>Your Nebula</h1>
                <p>No story planets yet. Create a project from the Writer's Room.</p>
                <Link className="kk-primary-cta compact" href="/">Enter the Writer's Room</Link>
              </div>
            ) : null}
            {projects.map((project, index) => {
              const lit = litIds.includes(project.id);
              const status = getPlanetStatus(project, lit);
              return (
                <button
                  className="galaxy-planet-node"
                  data-status={status.toLowerCase().replace(/\s+/g, "-")}
                  key={project.id}
                  onClick={() => setSelectedId(project.id)}
                  style={{ left: `${16 + (index * 19) % 68}%`, top: `${24 + (index * 23) % 54}%` }}
                  type="button"
                >
                  <span />
                  <small>{project.title || "Untitled"}</small>
                </button>
              );
            })}
          </div>
        </section>

        <aside className="planet-detail-panel">
          <span>YOUR NEBULA</span>
          <div className="nebula-stat-grid">
            <strong>{stats.stories}<span>stories</span></strong>
            <strong>{stats.characters}<span>characters</span></strong>
            <strong>{stats.lit}<span>lit</span></strong>
          </div>

          {selected ? (
            <article>
              <h1>{selected.title || "Untitled World"}</h1>
              <p>{selected.genre || "Genre TBD"} · {selected.workflowType}</p>
              <dl>
                <div><dt>Status</dt><dd>{getPlanetStatus(selected, litIds.includes(selected.id))}</dd></div>
                <div><dt>Progress</dt><dd>{getCompletedStepCount(selected)}/{getWorkflowSteps(selected).length}</dd></div>
                <div><dt>Episodes</dt><dd>{selected.episodeCount}</dd></div>
                <div><dt>Characters</dt><dd>{selected.characterCards.length}</dd></div>
                <div><dt>Last opened</dt><dd>{new Date(selected.updatedAt).toLocaleDateString()}</dd></div>
              </dl>
              <Link className="kk-secondary-cta full" href={`/projects/${selected.id}`}>Open World</Link>
              <button className="kk-primary-cta full" type="button" onClick={() => lightPlanet(selected.id)}>
                Light the Planet
              </button>
              {litIds.includes(selected.id) ? <p className="planet-lit-message">Your story is now a star in your universe.</p> : null}
            </article>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
