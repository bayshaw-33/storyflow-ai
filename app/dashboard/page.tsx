"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  createContinuationProject,
  createProject,
  DEFAULT_PROJECT_GROUP,
  DramaProject,
  EPISODE_COUNT_OPTIONS,
  EPISODE_DURATION_OPTIONS,
  GENRE_OPTIONS,
  LANGUAGE_OPTIONS,
  MARKET_OPTIONS,
  readProjectGroupsFromStorage,
  readProjectsFromStorage,
  saveProjectGroupsToStorage,
  upsertProject,
  WorkflowType,
} from "@/lib/projects";
import {
  saveProjectGroupsToSupabase,
  syncProjectsWithSupabase,
  upsertProjectToSupabase,
} from "@/lib/supabase/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { ProjectList } from "@/components/home/ProjectList";
import { WorkflowList } from "@/components/home/WorkflowList";
import { WritersPanel } from "@/components/home/WritersPanel";
import { WorkspaceModuleGrid } from "@/components/workspace/WorkspaceModuleGrid";
import { useKK } from "@/components/kk/KKProvider";
import { useOS } from "@/lib/os/uiState";
import type { WorkspaceModuleId } from "@/lib/design/manifest";
import { TopNav } from "@/components/layout/TopNav";
import { BRAND_NAME } from "@/lib/brand";
import { useI18n } from "@/lib/i18n/useI18n";

export default function ProjectListPage() {
  const router = useRouter();
  const kk = useKK();
  const os = useOS();
  const { locale, t } = useI18n();
  const isZh = locale === "zh-CN";
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [groups, setGroups] = useState<string[]>([DEFAULT_PROJECT_GROUP]);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardError, setWizardError] = useState("");
  const [wizardData, setWizardData] = useState({
    title: "",
    workflowType: "creation" as WorkflowType,
    market: "北美",
    genre: "逆袭复仇",
    targetLanguage: "英文",
    episodeCount: 12,
    episodeDuration: "2 分钟",
  });

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase?.auth.getSession().then(({ data }) => {
      setSession(data.session || null);
      loadProjects(data.session?.access_token || null);
    });

    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => {
        setSession(nextSession);
        loadProjects(nextSession?.access_token || null);
      }) || {};

    if (!supabase) loadProjects(null);

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  function loadProjects(accessToken: string | null) {
    const localProjects = readProjectsFromStorage();
    setProjects(localProjects);
    const storedGroups = readProjectGroupsFromStorage();
    const projectGroups = localProjects.map((project) => project.projectGroup || DEFAULT_PROJECT_GROUP);
    setGroups(Array.from(new Set([DEFAULT_PROJECT_GROUP, ...storedGroups, ...projectGroups])));
    setLoaded(true);

    void syncProjectsWithSupabase(localProjects, { accessToken }).then((result) => {
      setProjects(result.projects);
      setGroups(result.groups);
    });
  }

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [projects],
  );

  const groupedProjects = useMemo(
    () =>
      groups
        .map((group) => ({
          group,
          projects: sortedProjects.filter((project) => (project.projectGroup || DEFAULT_PROJECT_GROUP) === group),
        }))
        .filter((item) => item.projects.length > 0 || item.group === DEFAULT_PROJECT_GROUP),
    [groups, sortedProjects],
  );

  function openModule(id: WorkspaceModuleId) {
    os.setSelectedWorkspaceModule(id);
    if (id === "settings") {
      router.push("/settings");
      return;
    }
    // Cross-system link: Story Bible / Storyboard open the Universe graph.
    if (id === "story-bible" || id === "storyboard") {
      router.push("/universes");
      return;
    }
    // Project-scoped modules: surface the project list to pick a context.
    if (typeof window !== "undefined") {
      window.location.hash = "projects";
    }
  }

  function openWizard(type: WorkflowType) {
    setWizardError("");
    setWizardData((current) => ({ ...current, workflowType: type, title: "" }));
    setWizardOpen(true);
  }

  function submitWizard() {
    const title = wizardData.title.trim();
    if (!title) {
      setWizardError(t("wizard.titleRequired"));
      return;
    }

    kk.think(); // user committed a request -> THINKING

    const base = {
      title,
      market: wizardData.market,
      genre: wizardData.genre,
      targetLanguage: wizardData.targetLanguage,
      episodeCount: wizardData.episodeCount,
      episodeDuration: wizardData.episodeDuration,
      storyBible: {
        logline: "",
        sellingPoint: "",
        targetMarket: wizardData.market,
        genreType: wizardData.genre,
        world: "",
        mainConflict: "",
        characterRelationships: "",
        lockedCanon: "",
        languageStyle: "短对白、强情绪、强画面感、少解释。",
        pacingRules: "前 3 秒出钩子，每集结尾留强钩子。",
        confirmedFacts: "",
      },
    };
    const project = wizardData.workflowType === "continuation"
      ? createContinuationProject(base)
      : createProject(base);

    upsertProject(project);
    void upsertProjectToSupabase(project, { accessToken: session?.access_token });
    setWizardOpen(false);
    kk.celebrate(); // project created -> HAPPY
    router.push(`/projects/${project.id}?mode=${wizardData.workflowType}`);
  }

  function addGroup() {
    const name = window.prompt("请输入分组名称");
    const nextName = name?.trim();
    if (!nextName) return;

    const nextGroups = Array.from(new Set([DEFAULT_PROJECT_GROUP, ...groups, nextName]));
    setGroups(nextGroups);
    saveProjectGroupsToStorage(nextGroups);
    void saveProjectGroupsToSupabase(nextGroups, { accessToken: session?.access_token });
  }

  async function submitAuth() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setAuthError("Supabase 尚未配置，暂时只能使用本地草稿。");
      return;
    }

    setAuthError("");
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || password.length < 6) {
      setAuthError("请输入邮箱和至少 6 位密码。");
      return;
    }

    const result =
      authMode === "signup"
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setAuthError(result.error.message);
      return;
    }

    setAuthOpen(false);
    setAuthPassword("");
  }

  async function signOut() {
    const supabase = getSupabaseBrowserClient();
    await supabase?.auth.signOut();
    setSession(null);
    loadProjects(null);
  }

  return (
    <main className="kiikis-site">
      <TopNav
        session={session}
        onEnterRoom={() => openWizard("creation")}
        onSignIn={() => {
          setAuthMode("signin");
          setAuthOpen(true);
        }}
        onSignUp={() => {
          setAuthMode("signup");
          setAuthOpen(true);
        }}
        onSignOut={signOut}
      />

      <section className="kiikis-dashboard-shell" id="dashboard">
        <aside className="dashboard-sidebar" aria-label="Dashboard navigation">
          <a className="active" href="#dashboard">{isZh ? "总览" : "Overview"}</a>
          <a href="#projects">{isZh ? "项目" : "Projects"}</a>
          <a href="/universes">{isZh ? "宇宙" : "Universe"}</a>
          <a href="/companions">{isZh ? "伙伴" : "Companions"}</a>
          <a href="#workflows">{isZh ? "工作流" : "Workflows"}</a>
          <a href="/templates">{isZh ? "模板" : "Templates"}</a>
          <a href="#analytics">{isZh ? "分析" : "Analytics"}</a>
          <a href="/settings">{isZh ? "设置" : "Settings"}</a>
        </aside>

        <div className="dashboard-main">
          <header className="dashboard-welcome">
            <div>
              <span>{isZh ? "创作指挥中心" : "CREATOR COMMAND CENTER"}</span>
              <h2>{isZh ? "欢迎回来" : "Welcome back"}, {session?.user.email?.split("@")[0] || (isZh ? "作者" : "Writer")}.</h2>
              <p>{isZh ? "今天继续构建一个难忘的故事。" : "Let's build something unforgettable."}</p>
            </div>
            <div className="dashboard-search" role="search">
              <span>{isZh ? "搜索项目、世界、场景..." : "Search projects, worlds, scenes..."}</span>
            </div>
          </header>

          <WorkspaceModuleGrid onSelectModule={openModule} />
          <WorkflowList onSelectWorkflow={openWizard} />
          <ProjectList
            groupedProjects={groupedProjects}
            loaded={loaded}
            projectCount={projects.length}
            onAddGroup={addGroup}
            onCreateProject={() => openWizard("creation")}
          />
        </div>

        <aside className="dashboard-right-rail">
          <section className="dashboard-panel nebula-preview">
            <div className="dashboard-panel-head">
              <div>
                <span>{isZh ? "你的星云" : "YOUR NEBULA"}</span>
                <h2>{isZh ? "宇宙状态" : "Universe signal"}</h2>
              </div>
            </div>
            <div className="nebula-stat-grid">
              <strong>{projects.length}<span>{isZh ? "故事" : "stories"}</span></strong>
              <strong>{groups.length}<span>{isZh ? "世界" : "worlds"}</span></strong>
              <strong>{projects.filter((project) => project.finalScript?.trim()).length}<span>{isZh ? "点亮星球" : "lit planets"}</span></strong>
            </div>
            <a className="kk-primary-cta compact" href="/universes">{isZh ? "查看宇宙" : "View Universe"}</a>
          </section>
          <section className="dashboard-panel today-spark">
            <span>{isZh ? "今日火花" : "TODAY'S SPARK"}</span>
            <p>{isZh ? "当角色停止解释，开始选择，秘密才真正显现。" : "A secret becomes visible only when the character stops explaining and starts choosing."}</p>
          </section>
          <WritersPanel />
        </aside>
      </section>

      {authOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{BRAND_NAME}</h2>
            <p>{t("auth.cloudSaveHint")}</p>
            <input
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder={t("auth.email")}
              type="email"
            />
            <input
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder={t("auth.password")}
              type="password"
            />
            {authError ? <div className="notice error">{authError}</div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setAuthOpen(false)}>{t("auth.cancel")}</button>
              <button className="primary-button" onClick={submitAuth}>
                {authMode === "signup" ? t("auth.signUp") : t("auth.signIn")}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>{wizardData.workflowType === "continuation" ? t("wizard.createContinuation") : t("wizard.createOriginal")}</h2>
            <p>{t("wizard.description")}</p>
            <label>
              {t("wizard.projectTitle")}
              <input
                value={wizardData.title}
                onChange={(event) => setWizardData((current) => ({ ...current, title: event.target.value }))}
                placeholder={t("wizard.titlePlaceholder")}
                autoFocus
              />
            </label>
            <div className="wizard-grid">
              <label>
                {t("wizard.workflowMode")}
                <select
                  value={wizardData.workflowType}
                  onChange={(event) => setWizardData((current) => ({ ...current, workflowType: event.target.value as WorkflowType }))}
                >
                  <option value="creation">{t("wizard.original")}</option>
                  <option value="continuation">{t("wizard.continuation")}</option>
                </select>
              </label>
              <label>
                {t("wizard.targetMarket")}
                <select value={wizardData.market} onChange={(event) => setWizardData((current) => ({ ...current, market: event.target.value }))}>
                  {MARKET_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                {t("wizard.genreType")}
                <select value={wizardData.genre} onChange={(event) => setWizardData((current) => ({ ...current, genre: event.target.value }))}>
                  {GENRE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                {t("wizard.outputLanguage")}
                <select value={wizardData.targetLanguage} onChange={(event) => setWizardData((current) => ({ ...current, targetLanguage: event.target.value }))}>
                  {LANGUAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                {t("wizard.episodeCount")}
                <select value={wizardData.episodeCount} onChange={(event) => setWizardData((current) => ({ ...current, episodeCount: Number(event.target.value) }))}>
                  {EPISODE_COUNT_OPTIONS.map((option) => <option key={option} value={option}>{option} {t("common.episodeUnit")}</option>)}
                </select>
              </label>
              <label>
                {t("wizard.episodeDuration")}
                <select value={wizardData.episodeDuration} onChange={(event) => setWizardData((current) => ({ ...current, episodeDuration: event.target.value }))}>
                  {EPISODE_DURATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            {wizardError ? <div className="notice error">{wizardError}</div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setWizardOpen(false)}>{t("auth.cancel")}</button>
              <button className="primary-button" onClick={submitWizard}>{t("wizard.enterWorkspace")}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
