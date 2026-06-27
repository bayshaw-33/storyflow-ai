"use client";

import Link from "next/link";
import { useState } from "react";
import { Download, Plus, Save, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

type Shot = {
  id: string;
  text: string;
};

type Scene = {
  id: string;
  title: string;
  shots: Shot[];
};

type StoryboardState = {
  script: string;
  scenes: Scene[];
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

const initialState: StoryboardState = {
  script: "",
  scenes: [
    {
      id: "scene-1",
      title: "Scene 1",
      shots: [{ id: "shot-1", text: "" }],
    },
  ],
};

export default function StoryboardWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [state, setState] = useState<StoryboardState>(initialState);
  const [selectedSceneId, setSelectedSceneId] = useState(initialState.scenes[0].id);

  const selectedScene = state.scenes.find((scene) => scene.id === selectedSceneId) || state.scenes[0];
  const allShots = state.scenes.flatMap((scene) =>
    scene.shots.map((shot) => ({
      ...shot,
      sceneTitle: scene.title,
    })),
  );

  function updateScript(script: string) {
    setState((current) => ({ ...current, script }));
  }

  function addScene() {
    const scene: Scene = {
      id: createId("scene"),
      title: `Scene ${state.scenes.length + 1}`,
      shots: [{ id: createId("shot"), text: "" }],
    };
    setState((current) => ({ ...current, scenes: [...current.scenes, scene] }));
    setSelectedSceneId(scene.id);
  }

  function updateSceneTitle(sceneId: string, title: string) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) => (scene.id === sceneId ? { ...scene, title } : scene)),
    }));
  }

  function deleteScene(sceneId: string) {
    setState((current) => {
      const nextScenes = current.scenes.filter((scene) => scene.id !== sceneId);
      const safeScenes = nextScenes.length ? nextScenes : [{ id: createId("scene"), title: "Scene 1", shots: [] }];
      if (sceneId === selectedSceneId) setSelectedSceneId(safeScenes[0].id);
      return { ...current, scenes: safeScenes };
    });
  }

  function addShot(sceneId: string) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === sceneId
          ? { ...scene, shots: [...scene.shots, { id: createId("shot"), text: "" }] }
          : scene,
      ),
    }));
  }

  function updateShot(sceneId: string, shotId: string, text: string) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === sceneId
          ? { ...scene, shots: scene.shots.map((shot) => (shot.id === shotId ? { ...shot, text } : shot)) }
          : scene,
      ),
    }));
  }

  function deleteShot(sceneId: string, shotId: string) {
    setState((current) => ({
      ...current,
      scenes: current.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, shots: scene.shots.filter((shot) => shot.id !== shotId) } : scene,
      ),
    }));
  }

  function exportJson() {
    const json = JSON.stringify(state);
    console.log(json);
  }

  function saveVideoReference() {
    const json = JSON.stringify(state);
    const link: WeakLink = {
      sourceTool: "storyboard",
      targetTool: "video",
      type: "reference",
      strength: 0.6,
    };
    console.log(json);
    localStorage.setItem("storyboard_export", json);
    localStorage.setItem("storyboard_video_link", JSON.stringify(link));
  }

  return (
    <main className="app-shell production-workbench-page simple-workbench-page">
      <header className="simple-workbench-header">
        <div>
          <span>{isZh ? "分镜创作" : "Storyboard Workbench"}</span>
          <h1>{isZh ? "分镜工作台" : "Storyboard Workbench"}</h1>
        </div>
      </header>

      <section className="dashboard-panel simple-workbench-section">
        <span className="simple-zone-label">{isZh ? "Primary Input Area" : "Primary Input Area"}</span>
        <h2>{isZh ? "Script Input" : "Script Input"}</h2>
        <textarea
          value={state.script}
          onChange={(event) => updateScript(event.target.value)}
          placeholder={isZh ? "在这里写剧本..." : "Write your script here..."}
          aria-label="Script Input"
        />
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <span className="simple-zone-label">{isZh ? "Content Workspace" : "Content Workspace"}</span>
        <div className="simple-section-head">
          <h2>{isZh ? "Scene List" : "Scene List"}</h2>
          <button className="secondary-button" type="button" onClick={addScene}>
            <Plus size={16} />
            {isZh ? "新增 Scene" : "Add Scene"}
          </button>
        </div>
        <div className="simple-scene-list">
          {state.scenes.map((scene) => (
            <button
              key={scene.id}
              type="button"
              className={scene.id === selectedScene.id ? "active" : ""}
              onClick={() => setSelectedSceneId(scene.id)}
            >
              <strong>{scene.title || "Untitled Scene"}</strong>
              <span>{scene.shots.length} shots</span>
            </button>
          ))}
        </div>
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <span className="simple-zone-label">{isZh ? "Content Workspace" : "Content Workspace"}</span>
        <div className="simple-section-head">
          <h2>{isZh ? "Shot Editor Panel" : "Shot Editor Panel"}</h2>
          <button className="secondary-button" type="button" onClick={() => addShot(selectedScene.id)}>
            <Plus size={16} />
            {isZh ? "新增 Shot" : "Add Shot"}
          </button>
        </div>
        <label className="simple-field">
          {isZh ? "Scene 标题" : "Scene title"}
          <input value={selectedScene.title} onChange={(event) => updateSceneTitle(selectedScene.id, event.target.value)} />
        </label>
        <div className="simple-shot-list">
          {selectedScene.shots.map((shot, index) => (
            <div className="simple-shot-row" key={shot.id}>
              <label>
                Shot {index + 1}
                <textarea value={shot.text} onChange={(event) => updateShot(selectedScene.id, shot.id, event.target.value)} />
              </label>
              <button className="icon-button" type="button" onClick={() => deleteShot(selectedScene.id, shot.id)} aria-label="Delete Shot">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button className="secondary-button" type="button" onClick={() => deleteScene(selectedScene.id)} disabled={state.scenes.length <= 1}>
          <Trash2 size={16} />
          {isZh ? "删除 Scene" : "Delete Scene"}
        </button>
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <span className="simple-zone-label">{isZh ? "Output Panel" : "Output Panel"}</span>
        <div className="simple-section-head">
          <h2>{isZh ? "Shots ready for Video Workbench" : "Shots ready for Video Workbench"}</h2>
          <span className="simple-count-pill">{allShots.length} shots</span>
        </div>
        <div className="continuity-shot-list">
          {allShots.map((shot, index) => (
            <article className="continuity-shot-card" key={shot.id}>
              <span>Shot {index + 1}</span>
              <strong>{shot.sceneTitle || "Untitled Scene"}</strong>
              <p>{shot.text || (isZh ? "空镜头文本" : "Empty shot text")}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <span className="simple-zone-label">{isZh ? "Export Action Area" : "Export Action Area"}</span>
        <div className="simple-section-head">
          <h2>{isZh ? "导出" : "Export"}</h2>
          <div className="simple-action-row">
            <button className="primary-button" type="button" onClick={exportJson}>
              <Download size={16} />
              {isZh ? "导出 JSON" : "Export JSON"}
            </button>
            <button className="secondary-button" type="button" onClick={saveVideoReference}>
              <Save size={16} />
              {isZh ? "保存为视频参考" : "Save Video Reference"}
            </button>
            <Link className="secondary-button" href="/video-workbench">
              {isZh ? "打开视频工作台" : "Open Video Workbench"}
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
