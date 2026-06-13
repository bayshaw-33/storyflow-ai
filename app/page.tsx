"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  createContinuationProject,
  createProject,
  DEFAULT_PROJECT_GROUP,
  deleteProject,
  DramaProject,
  EPISODE_COUNT_OPTIONS,
  EPISODE_DURATION_OPTIONS,
  GENRE_OPTIONS,
  LANGUAGE_OPTIONS,
  MARKET_OPTIONS,
  readProjectGroupsFromStorage,
  readProjectsFromStorage,
  saveProjectGroupsToStorage,
  saveProjectsToStorage,
  upsertProject,
  WorkflowType,
} from "@/lib/projects";
import {
  deleteProjectFromSupabase,
  saveProjectGroupsToSupabase,
  syncProjectsWithSupabase,
  upsertProjectToSupabase,
} from "@/lib/supabase/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { HeroSection } from "@/components/home/HeroSection";
import { KKFloatingOrb } from "@/components/home/KKFloatingOrb";
import { ProjectList } from "@/components/home/ProjectList";
import { WorkflowGrid } from "@/components/home/WorkflowGrid";
import { WritersPanel } from "@/components/home/WritersPanel";
import { TopNav } from "@/components/layout/TopNav";
import { BRAND_NAME } from "@/lib/brand";

export default function ProjectListPage() {
  const router = useRouter();
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

  function openWizard(type: WorkflowType) {
    setWizardError("");
    setWizardData((current) => ({ ...current, workflowType: type, title: "" }));
    setWizardOpen(true);
  }

  function submitWizard() {
    const title = wizardData.title.trim();
    if (!title) {
      setWizardError("请先填写项目标题。");
      return;
    }

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

  function moveProject(projectId: string, group: string) {
    const nextProjects = projects.map((project) =>
      project.id === projectId
        ? { ...project, projectGroup: group, updatedAt: new Date().toISOString() }
        : project,
    );
    setProjects(nextProjects);
    saveProjectsToStorage(nextProjects);
    const moved = nextProjects.find((project) => project.id === projectId);
    if (moved) void upsertProjectToSupabase(moved, { accessToken: session?.access_token });
  }

  function removeProject(projectId: string, title: string) {
    const confirmed = window.confirm(`确定删除「${title || "未命名项目"}」吗？此操作只会删除本机浏览器里的项目记录。`);
    if (!confirmed) return;

    deleteProject(projectId);
    void deleteProjectFromSupabase(projectId, { accessToken: session?.access_token });
    setProjects(readProjectsFromStorage());
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
    <main className="kk-home-shell">
      <TopNav
        session={session}
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

      <HeroSection onStartCreating={() => openWizard("creation")} />

      <div className="kk-home-grid">
        <div className="kk-home-primary">
          <WorkflowGrid onSelectWorkflow={openWizard} />
          <ProjectList
            groupedProjects={groupedProjects}
            groups={groups}
            loaded={loaded}
            projectCount={projects.length}
            onAddGroup={addGroup}
            onMoveProject={moveProject}
            onRemoveProject={removeProject}
          />
        </div>
        <WritersPanel />
      </div>

      <KKFloatingOrb />

      {authOpen ? (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>{BRAND_NAME}</h2>
            <p>登录后项目会保存到云端，本地草稿会自动合并导入。</p>
            <input
              value={authEmail}
              onChange={(event) => setAuthEmail(event.target.value)}
              placeholder="邮箱"
              type="email"
            />
            <input
              value={authPassword}
              onChange={(event) => setAuthPassword(event.target.value)}
              placeholder="密码"
              type="password"
            />
            {authError ? <div className="notice error">{authError}</div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setAuthOpen(false)}>取消</button>
              <button className="primary-button" onClick={submitAuth}>
                {authMode === "signup" ? "注册" : "登录"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {wizardOpen ? (
        <div className="modal-backdrop">
          <div className="modal wizard-modal">
            <h2>{wizardData.workflowType === "continuation" ? "创建剧本续写项目" : "创建原创项目"}</h2>
            <p>先完成基础设定，再进入 StoryFlow 2.0 工作台。</p>
            <label>
              项目标题
              <input
                value={wizardData.title}
                onChange={(event) => setWizardData((current) => ({ ...current, title: event.target.value }))}
                placeholder="例如：午夜继承人"
                autoFocus
              />
            </label>
            <div className="wizard-grid">
              <label>
                创作模式
                <select
                  value={wizardData.workflowType}
                  onChange={(event) => setWizardData((current) => ({ ...current, workflowType: event.target.value as WorkflowType }))}
                >
                  <option value="creation">原创</option>
                  <option value="continuation">续写</option>
                </select>
              </label>
              <label>
                目标市场
                <select value={wizardData.market} onChange={(event) => setWizardData((current) => ({ ...current, market: event.target.value }))}>
                  {MARKET_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                题材类型
                <select value={wizardData.genre} onChange={(event) => setWizardData((current) => ({ ...current, genre: event.target.value }))}>
                  {GENRE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                输出语言
                <select value={wizardData.targetLanguage} onChange={(event) => setWizardData((current) => ({ ...current, targetLanguage: event.target.value }))}>
                  {LANGUAGE_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                集数
                <select value={wizardData.episodeCount} onChange={(event) => setWizardData((current) => ({ ...current, episodeCount: Number(event.target.value) }))}>
                  {EPISODE_COUNT_OPTIONS.map((option) => <option key={option} value={option}>{option} 集</option>)}
                </select>
              </label>
              <label>
                单集时长
                <select value={wizardData.episodeDuration} onChange={(event) => setWizardData((current) => ({ ...current, episodeDuration: event.target.value }))}>
                  {EPISODE_DURATION_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
            </div>
            {wizardError ? <div className="notice error">{wizardError}</div> : null}
            <div className="modal-actions">
              <button className="secondary-button" onClick={() => setWizardOpen(false)}>取消</button>
              <button className="primary-button" onClick={submitWizard}>进入工作台</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
