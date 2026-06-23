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
import { useKK } from "@/components/kk/KKProvider";
import { TopNav } from "@/components/layout/TopNav";
import { AuthModal } from "@/components/layout/AuthModal";
import { useI18n } from "@/lib/i18n/useI18n";

export default function ProjectListPage() {
  const router = useRouter();
  const kk = useKK();
  const { locale, t } = useI18n();
  const isZh = locale === "zh-CN";
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [groups, setGroups] = useState<string[]>([DEFAULT_PROJECT_GROUP]);
  const [loaded, setLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardError, setWizardError] = useState("");
  const [wizardData, setWizardData] = useState({
    title: "",
    workflowType: "creation" as Extract<WorkflowType, "creation" | "continuation">,
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

  function openWizard(type: Extract<WorkflowType, "creation" | "continuation">) {
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

      <section className="kiikis-dashboard-shell kiikis-dashboard-single" id="dashboard">
        <div className="dashboard-main">
          <header className="dashboard-welcome">
            <div>
              <span>{t("dashboard.welcome.kicker")}</span>
              <h2>{isZh ? "欢迎回来" : "Welcome back"}, {session?.user.email?.split("@")[0] || (isZh ? "作者" : "Writer")}.</h2>
              <p>{t("dashboard.welcome.body")}</p>
            </div>
            <div className="dashboard-search" role="search">
              <span>{t("dashboard.search.placeholder")}</span>
            </div>
          </header>

          <WorkflowList onSelectWorkflow={openWizard} onOpenSongWorkbench={() => router.push("/song-workbench")} />
          <ProjectList
            groupedProjects={groupedProjects}
            loaded={loaded}
            projectCount={projects.length}
            onAddGroup={addGroup}
            onCreateProject={() => openWizard("creation")}
          />
        </div>
      </section>

      <AuthModal open={authOpen} mode={authMode} onClose={() => setAuthOpen(false)} />

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
                  onChange={(event) => setWizardData((current) => ({ ...current, workflowType: event.target.value as Extract<WorkflowType, "creation" | "continuation"> }))}
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
