"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ArrowRight, Download, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  buildProjectLink,
  listUniverses,
  saveInboxItems,
  upsertUniverse,
  upsertUniverseProjectLink,
  type Universe,
} from "@/lib/universe";
import type { CreativePackage } from "@/lib/universe/creative-package";

type Shot = {
  id: string;
  text: string;
  frame: string;
  action: string;
  camera: string;
  duration: string;
  continuity: string;
  visualPrompt: string;
};

type Scene = {
  id: string;
  title: string;
  location: string;
  intention: string;
  shots: Shot[];
};

type StoryboardState = {
  id: string;
  projectTitle: string;
  script: string;
  visualStyle: string;
  aspectRatio: "9:16" | "16:9" | "1:1";
  scenes: Scene[];
};

type VideoReadyShot = Shot & {
  sceneTitle: string;
  sceneLocation: string;
  prompt: string;
};

type WeakLink = {
  sourceTool: string;
  targetTool: string;
  type: "reference" | "inspiration" | "derived";
  strength: number;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createShot(index = 1, text = ""): Shot {
  return {
    id: createId("shot"),
    text,
    frame: "Medium shot",
    action: "",
    camera: "Static camera",
    duration: "5s",
    continuity: "",
    visualPrompt: "",
  };
}

const initialState: StoryboardState = {
  id: createId("storyboard-package"),
  projectTitle: "",
  script: "",
  visualStyle: "cinematic short drama, realistic lighting, high emotional tension",
  aspectRatio: "9:16",
  scenes: [
    {
      id: "scene-1",
      title: "Scene 1",
      location: "",
      intention: "",
      shots: [createShot(1)],
    },
  ],
};

function buildVideoPrompt(state: StoryboardState, scene: Scene, shot: Shot) {
  return [
    state.visualStyle,
    `Aspect ratio ${state.aspectRatio}.`,
    scene.location ? `Location: ${scene.location}.` : "",
    scene.intention ? `Scene intention: ${scene.intention}.` : "",
    shot.text ? `Story beat: ${shot.text}.` : "",
    shot.frame ? `Framing: ${shot.frame}.` : "",
    shot.action ? `Action: ${shot.action}.` : "",
    shot.camera ? `Camera: ${shot.camera}.` : "",
    shot.continuity ? `Continuity: ${shot.continuity}.` : "",
    shot.visualPrompt ? `Visual notes: ${shot.visualPrompt}.` : "",
  ].filter(Boolean).join(" ");
}

function splitScriptIntoScenes(script: string): Scene[] {
  const blocks = script
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) return initialState.scenes;

  return blocks.slice(0, 12).map((block, sceneIndex) => {
    const lines = block.split(/\n|(?<=[。！？.!?])\s+/).map((line) => line.trim()).filter(Boolean);
    const title = lines[0]?.slice(0, 28) || `Scene ${sceneIndex + 1}`;
    return {
      id: createId("scene"),
      title,
      location: "",
      intention: "",
      shots: (lines.length ? lines : [block]).slice(0, 8).map((line, shotIndex) => createShot(shotIndex + 1, line)),
    };
  });
}

export default function StoryboardWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [state, setState] = useState<StoryboardState>(initialState);
  const [selectedSceneId, setSelectedSceneId] = useState(initialState.scenes[0].id);
  const [session, setSession] = useState<Session | null>(null);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState("");
  const [universeBusy, setUniverseBusy] = useState(false);
  const [universeStatus, setUniverseStatus] = useState("");
  const selectedScene = state.scenes.find((scene) => scene.id === selectedSceneId) || state.scenes[0];

  const videoReadyShots = useMemo<VideoReadyShot[]>(
    () =>
      state.scenes.flatMap((scene) =>
        scene.shots.map((shot) => ({
          ...shot,
          sceneTitle: scene.title,
          sceneLocation: scene.location,
          prompt: buildVideoPrompt(state, scene, shot),
        })),
      ),
    [state],
  );

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void listUniverses({ accessToken: session?.access_token })
      .then((items) => {
        setUniverses(items);
        setSelectedUniverseId((current) => current || items[0]?.id || "");
      })
      .catch(() => null);
  }, [session?.access_token]);

  function updateState<K extends keyof StoryboardState>(key: K, value: StoryboardState[K]) {
    setState((current) => ({ ...current, [key]: value }));
  }

  function addScene() {
    const scene: Scene = {
      id: createId("scene"),
      title: `Scene ${state.scenes.length + 1}`,
      location: "",
      intention: "",
      shots: [createShot(1)],
    };
    setState((current) => ({ ...current, scenes: [...current.scenes, scene] }));
    setSelectedSceneId(scene.id);
  }

  function updateScene(sceneId: string, patch: Partial<Scene>) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === sceneId ? { ...scene, ...patch } : scene)),
    }));
  }

  function deleteScene(sceneId: string) {
    setState((current) => {
      const scenes = current.scenes.filter((scene) => scene.id !== sceneId);
      const safeScenes = scenes.length ? scenes : [{ ...initialState.scenes[0], id: createId("scene") }];
      if (sceneId === selectedSceneId) setSelectedSceneId(safeScenes[0].id);
      return { ...current, scenes: safeScenes };
    });
  }

  function addShot(sceneId: string) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, shots: [...scene.shots, createShot(scene.shots.length + 1)] } : scene,
      ),
    }));
  }

  function updateShot(sceneId: string, shotId: string, patch: Partial<Shot>) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === sceneId
          ? { ...scene, shots: scene.shots.map((shot) => (shot.id === shotId ? { ...shot, ...patch } : shot)) }
          : scene,
      ),
    }));
  }

  function deleteShot(sceneId: string, shotId: string) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => {
        if (scene.id !== sceneId) return scene;
        const shots = scene.shots.filter((shot) => shot.id !== shotId);
        return { ...scene, shots: shots.length ? shots : [createShot(1)] };
      }),
    }));
  }

  function autoBreakScript() {
    const scenes = splitScriptIntoScenes(state.script);
    setState((current) => ({ ...current, scenes }));
    setSelectedSceneId(scenes[0].id);
  }

  function buildStoryboardPackage(universeId = selectedUniverseId || null): CreativePackage {
    const title = state.projectTitle.trim() || (isZh ? "未命名分镜" : "Untitled Storyboard");
    const locations = Array.from(new Set(state.scenes.map((scene) => scene.location.trim()).filter(Boolean)))
      .map((name) => ({ name, visualNotes: state.visualStyle }));

    return {
      id: state.id,
      workflowType: "storyboard",
      title,
      summary: state.script.slice(0, 900) || state.scenes.map((scene) => scene.intention).filter(Boolean).join("\n"),
      language: isZh ? "zh-CN" : "en",
      universeId,
      sourceProjectId: state.id,
      sourceProjectTitle: title,
      locations,
      scenes: state.scenes.map((scene) => ({
        id: scene.id,
        title: scene.title,
        summary: scene.intention,
        location: scene.location,
        shots: scene.shots.map((shot, index) => ({
          id: shot.id,
          title: `Shot ${index + 1}`,
          prompt: buildVideoPrompt(state, scene, shot),
          duration: shot.duration,
        })),
      })),
      assets: [
        {
          id: `${state.id}-storyboard`,
          type: "storyboard",
          title: `${title} storyboard package`,
          prompt: state.visualStyle,
          metadata: { aspectRatio: state.aspectRatio, shotCount: videoReadyShots.length },
        },
      ],
      canonFacts: [
        state.visualStyle ? `Visual style for ${title}: ${state.visualStyle}` : "",
        ...state.scenes.map((scene) => scene.intention).filter(Boolean).map((item) => `Scene intention: ${item}`),
      ].filter(Boolean),
      sourceText: state.script,
      metadata: { aspectRatio: state.aspectRatio, videoReadyShots },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function saveVideoReference() {
    const exportState = { ...state, universeId: selectedUniverseId || null, videoReadyShots, creativePackage: buildStoryboardPackage() };
    const link: WeakLink = {
      sourceTool: "storyboard",
      targetTool: "video",
      type: "reference",
      strength: 0.7,
    };
    console.log(JSON.stringify(exportState));
    localStorage.setItem("storyboard_export", JSON.stringify(exportState));
    localStorage.setItem("storyboard_video_link", JSON.stringify(link));
  }

  function exportJson() {
    const exportState = { ...state, universeId: selectedUniverseId || null, videoReadyShots, creativePackage: buildStoryboardPackage() };
    console.log(JSON.stringify(exportState));
  }

  async function createUniverseFromStoryboard() {
    if (!session?.access_token) {
      setUniverseStatus(isZh ? "请先登录后再创建 Universe。" : "Please sign in before creating a Universe.");
      return;
    }

    const now = new Date().toISOString();
    const pkg = buildStoryboardPackage();
    const universe: Universe = {
      id: `universe-${crypto.randomUUID()}`,
      user_id: session.user.id,
      name: `${pkg.title} Universe`,
      description: pkg.summary || pkg.title,
      genre: "Storyboard",
      default_language: pkg.language || "zh-CN",
      target_markets: [],
      tone: state.visualStyle,
      status: "active",
      access_level: "studio_annual",
      metadata: { source_workflow: "storyboard", source_package_id: pkg.id },
      created_at: now,
      updated_at: now,
    };

    setUniverseBusy(true);
    try {
      await upsertUniverse(universe, { accessToken: session.access_token });
      await upsertUniverseProjectLink(
        buildProjectLink({
          universeId: universe.id,
          projectId: state.id,
          userId: session.user.id,
          projectRole: "adaptation",
        }),
        { accessToken: session.access_token },
      );
      setUniverses((current) => [universe, ...current.filter((item) => item.id !== universe.id)]);
      setSelectedUniverseId(universe.id);
      setUniverseStatus(isZh ? "Universe 已创建并关联当前分镜。" : "Universe created and linked to this storyboard.");
    } catch (error) {
      setUniverseStatus(error instanceof Error ? error.message : (isZh ? "创建 Universe 失败。" : "Universe creation failed."));
    } finally {
      setUniverseBusy(false);
    }
  }

  async function sendStoryboardToUniverse() {
    if (!session?.access_token) {
      setUniverseStatus(isZh ? "请先登录后再发送 Universe Inbox。" : "Please sign in before sending to Universe Inbox.");
      return;
    }
    if (!selectedUniverseId) {
      setUniverseStatus(isZh ? "请先选择或创建 Universe。" : "Select or create a Universe first.");
      return;
    }

    setUniverseBusy(true);
    setUniverseStatus(isZh ? "正在发送到 Universe Inbox..." : "Sending to Universe Inbox...");
    try {
      const response = await fetch("/api/universe/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ universeId: selectedUniverseId, creativePackage: buildStoryboardPackage(selectedUniverseId) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (isZh ? "发送失败。" : "Failed to send."));
      await saveInboxItems(data.items || [], { accessToken: session.access_token });
      saveVideoReference();
      setUniverseStatus(isZh ? `已发送 ${data.items?.length || 0} 条候选项到 Inbox。` : `Sent ${data.items?.length || 0} candidates to Inbox.`);
    } catch (error) {
      setUniverseStatus(error instanceof Error ? error.message : (isZh ? "发送失败。" : "Failed to send."));
    } finally {
      setUniverseBusy(false);
    }
  }

  return (
    <main className="app-shell production-workbench-page simple-workbench-page studio-workbench-page">
      <header className="studio-workbench-header">
        <div>
          <span>{isZh ? "分镜创作" : "Storyboard Workbench"}</span>
          <h1>{isZh ? "脚本到镜头的生产台" : "Script-to-shot production desk"}</h1>
        </div>
        <div className="studio-flow-row" aria-label="workflow">
          <span>{isZh ? "剧本" : "Script"}</span>
          <ArrowRight size={14} />
          <span>{isZh ? "场景" : "Scenes"}</span>
          <ArrowRight size={14} />
          <span>{isZh ? "镜头" : "Shots"}</span>
          <ArrowRight size={14} />
          <span>{isZh ? "视频" : "Video"}</span>
        </div>
      </header>

      <section className="studio-three-column">
        <aside className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>{isZh ? "01 输入" : "01 Input"}</span>
            <h2>{isZh ? "剧本与视觉基调" : "Script and visual direction"}</h2>
          </div>
          <label className="studio-field">
            {isZh ? "项目名" : "Project title"}
            <input
              value={state.projectTitle}
              onChange={(event) => updateState("projectTitle", event.target.value)}
              placeholder={isZh ? "例如：狼人复仇短剧" : "e.g. Werewolf revenge short"}
            />
          </label>
          <label className="studio-field">
            {isZh ? "剧本" : "Script"}
            <textarea
              className="studio-script-input"
              value={state.script}
              onChange={(event) => updateState("script", event.target.value)}
              placeholder={isZh ? "粘贴剧本。用空行分隔场景，系统会按段落拆成 Scene。" : "Paste the script. Blank lines become scenes."}
            />
          </label>
          <label className="studio-field">
            {isZh ? "视觉风格" : "Visual style"}
            <textarea
              value={state.visualStyle}
              onChange={(event) => updateState("visualStyle", event.target.value)}
            />
          </label>
          <label className="studio-field">
            {isZh ? "画幅" : "Aspect ratio"}
            <select value={state.aspectRatio} onChange={(event) => updateState("aspectRatio", event.target.value as StoryboardState["aspectRatio"])}>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <button className="primary-button" type="button" onClick={autoBreakScript}>
            <Sparkles size={16} />
            {isZh ? "按段落拆 Scene" : "Break into scenes"}
          </button>
        </aside>

        <section className="dashboard-panel studio-panel">
          <div className="studio-section-head is-row">
            <div>
              <span>{isZh ? "02 场景" : "02 Scenes"}</span>
              <h2>{isZh ? "场景队列" : "Scene queue"}</h2>
            </div>
            <button className="secondary-button" type="button" onClick={addScene}>
              <Plus size={16} />
              {isZh ? "新增" : "Add"}
            </button>
          </div>
          <div className="studio-scene-grid">
            <div className="studio-scene-list">
              {state.scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  className={scene.id === selectedScene.id ? "studio-scene-card active" : "studio-scene-card"}
                  onClick={() => setSelectedSceneId(scene.id)}
                >
                  <span>Scene {index + 1}</span>
                  <strong>{scene.title || "Untitled"}</strong>
                  <small>{scene.shots.length} shots</small>
                </button>
              ))}
            </div>

            <div className="studio-shot-editor">
              <div className="studio-field-grid">
                <label className="studio-field">
                  {isZh ? "Scene 标题" : "Scene title"}
                  <input value={selectedScene.title} onChange={(event) => updateScene(selectedScene.id, { title: event.target.value })} />
                </label>
                <label className="studio-field">
                  {isZh ? "地点" : "Location"}
                  <input value={selectedScene.location} onChange={(event) => updateScene(selectedScene.id, { location: event.target.value })} />
                </label>
              </div>
              <label className="studio-field">
                {isZh ? "本场目的" : "Scene intention"}
                <textarea value={selectedScene.intention} onChange={(event) => updateScene(selectedScene.id, { intention: event.target.value })} />
              </label>

              <div className="studio-section-head is-row">
                <h3>{isZh ? "镜头清单" : "Shot list"}</h3>
                <button className="secondary-button" type="button" onClick={() => addShot(selectedScene.id)}>
                  <Plus size={16} />
                  {isZh ? "新增 Shot" : "Add Shot"}
                </button>
              </div>

              <div className="studio-shot-list">
                {selectedScene.shots.map((shot, index) => (
                  <article className="studio-shot-card" key={shot.id}>
                    <div className="studio-section-head is-row">
                      <span>Shot {index + 1}</span>
                      <button className="icon-button" type="button" onClick={() => deleteShot(selectedScene.id, shot.id)} aria-label="Delete shot">
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <label className="studio-field">
                      {isZh ? "剧情动作" : "Story beat"}
                      <textarea value={shot.text} onChange={(event) => updateShot(selectedScene.id, shot.id, { text: event.target.value })} />
                    </label>
                    <div className="studio-field-grid">
                      <label className="studio-field">
                        {isZh ? "景别" : "Frame"}
                        <input value={shot.frame} onChange={(event) => updateShot(selectedScene.id, shot.id, { frame: event.target.value })} />
                      </label>
                      <label className="studio-field">
                        {isZh ? "镜头运动" : "Camera"}
                        <input value={shot.camera} onChange={(event) => updateShot(selectedScene.id, shot.id, { camera: event.target.value })} />
                      </label>
                      <label className="studio-field">
                        {isZh ? "时长" : "Duration"}
                        <input value={shot.duration} onChange={(event) => updateShot(selectedScene.id, shot.id, { duration: event.target.value })} />
                      </label>
                    </div>
                    <label className="studio-field">
                      {isZh ? "动作与连续性" : "Action and continuity"}
                      <input value={shot.action} onChange={(event) => updateShot(selectedScene.id, shot.id, { action: event.target.value })} />
                    </label>
                    <label className="studio-field">
                      {isZh ? "视频提示词补充" : "Video prompt notes"}
                      <textarea value={shot.visualPrompt} onChange={(event) => updateShot(selectedScene.id, shot.id, { visualPrompt: event.target.value })} />
                    </label>
                  </article>
                ))}
              </div>

              <button className="secondary-button danger-button" type="button" onClick={() => deleteScene(selectedScene.id)} disabled={state.scenes.length <= 1}>
                <Trash2 size={16} />
                {isZh ? "删除当前 Scene" : "Delete current scene"}
              </button>
            </div>
          </div>
        </section>

        <aside className="dashboard-panel studio-panel">
          <div className="studio-section-head">
            <span>{isZh ? "03 交接" : "03 Handoff"}</span>
            <h2>{isZh ? "发往视频工作台" : "Ready for video"}</h2>
          </div>
          <div className="studio-metric-row">
            <strong>{state.scenes.length}</strong>
            <span>{isZh ? "场景" : "Scenes"}</span>
            <strong>{videoReadyShots.length}</strong>
            <span>{isZh ? "镜头" : "Shots"}</span>
          </div>
          <div className="studio-handoff-list">
            {videoReadyShots.map((shot, index) => (
              <article className="continuity-shot-card" key={shot.id}>
                <span>Shot {index + 1} · {shot.duration}</span>
                <strong>{shot.sceneTitle || "Untitled Scene"}</strong>
                <p>{shot.prompt || (isZh ? "等待填写镜头提示词" : "Waiting for prompt details")}</p>
              </article>
            ))}
          </div>
          <div className="simple-action-row">
            <button className="secondary-button" type="button" onClick={exportJson}>
              <Download size={16} />
              {isZh ? "导出 JSON" : "Export JSON"}
            </button>
            <Link className="primary-button" href="/video-workbench" onClick={saveVideoReference}>
              <Save size={16} />
              {isZh ? "发送到视频工作台" : "Send to Video"}
            </Link>
          </div>
          <div className="studio-universe-box">
            <div className="studio-section-head">
              <span>Universe</span>
              <h3>{isZh ? "保存到 Universe Inbox" : "Save to Universe Inbox"}</h3>
            </div>
            {universes.length ? (
              <label className="studio-field">
                {isZh ? "选择 Universe" : "Select Universe"}
                <select value={selectedUniverseId} onChange={(event) => setSelectedUniverseId(event.target.value)}>
                  {universes.map((universe) => (
                    <option key={universe.id} value={universe.id}>{universe.name}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <div className="simple-action-row">
              <button className="secondary-button" type="button" onClick={() => void createUniverseFromStoryboard()} disabled={universeBusy || !session}>
                {isZh ? "新建 Universe" : "New Universe"}
              </button>
              <button className="primary-button" type="button" onClick={() => void sendStoryboardToUniverse()} disabled={universeBusy || !session || !selectedUniverseId}>
                {isZh ? "发送 Inbox" : "Send Inbox"}
              </button>
            </div>
            {universeStatus ? <small className="field-note">{universeStatus}</small> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
