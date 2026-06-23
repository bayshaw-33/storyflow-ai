"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { UniverseGraph } from "@/components/universe/UniverseGraph";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import { buildUniverseGraphFromUniverses } from "@/lib/universe/graph";
import { listUniverses, createUniverseFromProject, type Universe } from "@/lib/universe";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useOS } from "@/lib/os/uiState";
import { useI18n } from "@/lib/i18n/useI18n";

type CreateForm = {
  projectId: string;
  name: string;
  description: string;
  genre: string;
  default_language: string;
  target_markets: string;
  tone: string;
};

const EMPTY_FORM: CreateForm = {
  projectId: "",
  name: "",
  description: "",
  genre: "",
  default_language: "English",
  target_markets: "",
  tone: "",
};

export default function UniversesPage() {
  const router = useRouter();
  const os = useOS();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_FORM);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  // PRICING → access control: Universe graph requires the PRO layer. No bypass.
  useEffect(() => {
    if (os.planReady && !os.access.universe) router.replace("/subscription");
  }, [os.planReady, os.access.universe, router]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    const load = async (nextSession: Session | null) => {
      const rows = await listUniverses({ accessToken: nextSession?.access_token ?? null });
      setUniverses(rows);
    };

    void supabase?.auth.getSession().then(({ data }) => {
      const s = data.session ?? null;
      setSession(s);
      void load(s);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        void load(nextSession);
      }) ?? {};

    if (!supabase) void load(null);

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    setProjects(readProjectsFromStorage());
  }, []);

  const graph = useMemo(() => buildUniverseGraphFromUniverses(universes), [universes]);

  function openCreate() {
    setError("");
    setCreateForm(EMPTY_FORM);
    setCreateOpen(true);
  }

  function handleProjectSelect(projectId: string) {
    const project = projects.find((p) => p.id === projectId);
    setCreateForm((f) => ({
      ...f,
      projectId,
      name: f.name || project?.title || "",
      genre: f.genre || project?.genre || "",
      default_language: f.default_language || project?.targetLanguage || "English",
      target_markets: f.target_markets || (project?.market ? project.market : ""),
    }));
  }

  async function submitCreate() {
    const project = projects.find((p) => p.id === createForm.projectId);
    if (!project) {
      setError(isZh ? "请选择一个项目" : "Select a project first.");
      return;
    }
    if (!createForm.name.trim()) {
      setError(isZh ? "宇宙名称不能为空" : "Universe name is required.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const { universe } = await createUniverseFromProject({
        project,
        form: {
          name: createForm.name.trim(),
          description: createForm.description.trim(),
          genre: createForm.genre.trim(),
          default_language: createForm.default_language.trim() || "English",
          target_markets: createForm.target_markets
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          tone: createForm.tone.trim(),
        },
        accessToken: session?.access_token ?? null,
      });
      router.push(`/universes/${universe.id}`);
    } catch {
      setError(isZh ? "创建失败，请重试" : "Creation failed. Please try again.");
      setCreating(false);
    }
  }

  if (os.planReady && !os.access.universe) return null;

  const activeCount = universes.filter((u) => u.status === "active").length;

  return (
    <main className="universe-engine">
      <Link className="universe-brand" href="/" aria-label="Home">
        <KiikisLogo compact />
      </Link>

      <div className="universe-mini-panel universe-stats-panel">
        <span>{isZh ? "你的星云" : "YOUR NEBULA"}</span>
        <h2>{isZh ? "宇宙状态" : "Universe signal"}</h2>
        <div className="nebula-stat-grid">
          <strong>
            {universes.length}
            <span>{isZh ? "宇宙" : "universes"}</span>
          </strong>
          <strong>
            {activeCount}
            <span>{isZh ? "活跃" : "active"}</span>
          </strong>
        </div>
        <button className="secondary-button" onClick={openCreate} disabled={projects.length === 0}>
          {isZh ? "从项目创建宇宙" : "Create Universe"}
        </button>
      </div>

      <UniverseGraph graph={graph} />

      {createOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>{isZh ? "从项目创建宇宙" : "Create Universe from Project"}</h2>
            <p>
              {isZh
                ? "选择一个现有项目作为宇宙的起点。创建后可继续扩展角色、时间线和世界规则。"
                : "Pick an existing project as the foundation. Add characters, timeline, and world rules after creation."}
            </p>

            <div className="wizard-grid">
              <label>
                {isZh ? "来源项目" : "Source project"}
                <select
                  value={createForm.projectId}
                  onChange={(e) => handleProjectSelect(e.target.value)}
                >
                  <option value="">{isZh ? "— 选择项目 —" : "— Select project —"}</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title || p.id}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                {isZh ? "宇宙名称" : "Universe name"}
                <input
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder={isZh ? "例：复仇千金宇宙" : "e.g. Revenge Heiress Universe"}
                  autoFocus
                />
              </label>

              <label>
                {isZh ? "简介" : "Description"}
                <input
                  value={createForm.description}
                  onChange={(e) => setCreateForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder={isZh ? "一句话描述宇宙核心设定" : "One-line world premise"}
                />
              </label>

              <label>
                {isZh ? "类型" : "Genre"}
                <input
                  value={createForm.genre}
                  onChange={(e) => setCreateForm((f) => ({ ...f, genre: e.target.value }))}
                  placeholder={isZh ? "例：商战·复仇·逆袭" : "e.g. Romance / Revenge"}
                />
              </label>

              <label>
                {isZh ? "主要语言" : "Default language"}
                <input
                  value={createForm.default_language}
                  onChange={(e) => setCreateForm((f) => ({ ...f, default_language: e.target.value }))}
                />
              </label>

              <label>
                {isZh ? "目标市场（逗号分隔）" : "Target markets (comma-separated)"}
                <input
                  value={createForm.target_markets}
                  onChange={(e) => setCreateForm((f) => ({ ...f, target_markets: e.target.value }))}
                  placeholder={isZh ? "例：北美,东南亚" : "e.g. North America, Southeast Asia"}
                />
              </label>

              <label>
                {isZh ? "基调" : "Tone"}
                <input
                  value={createForm.tone}
                  onChange={(e) => setCreateForm((f) => ({ ...f, tone: e.target.value }))}
                  placeholder={isZh ? "例：紧张·戏剧性" : "e.g. Dramatic, high-stakes"}
                />
              </label>
            </div>

            {error ? <p className="form-error">{error}</p> : null}

            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setCreateOpen(false)} disabled={creating}>
                {isZh ? "取消" : "Cancel"}
              </button>
              <button className="primary-button" onClick={submitCreate} disabled={creating}>
                {creating ? (isZh ? "创建中…" : "Creating…") : isZh ? "创建宇宙" : "Create Universe"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
