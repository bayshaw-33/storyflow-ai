"use client";

import { useEffect, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";

type VideoModel = "seedance" | "minimax";

type VideoShot = {
  id: string;
  prompt: string;
  status: "pending" | "done";
};

type VideoState = {
  shots: VideoShot[];
  model: VideoModel;
};

type StoryboardExport = {
  scenes?: Array<{
    shots?: Array<{
      text?: string;
    }>;
  }>;
};

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const initialState: VideoState = {
  model: "seedance",
  shots: [{ id: "video-shot-1", prompt: "", status: "pending" }],
};

function shotsFromStoryboard(raw: string | null): VideoShot[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as StoryboardExport;
    return (parsed.scenes || [])
      .flatMap((scene) => scene.shots || [])
      .map((shot) => shot.text?.trim() || "")
      .filter(Boolean)
      .map((prompt, index) => ({
        id: `storyboard-shot-${index + 1}`,
        prompt,
        status: "pending" as const,
      }));
  } catch {
    return [];
  }
}

export default function VideoWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [state, setState] = useState<VideoState>(initialState);
  const [importedShotCount, setImportedShotCount] = useState(0);
  const [importedShots, setImportedShots] = useState<VideoShot[]>([]);

  useEffect(() => {
    const nextImportedShots = shotsFromStoryboard(localStorage.getItem("storyboard_export"));
    if (nextImportedShots.length) {
      setImportedShots(nextImportedShots);
      setImportedShotCount(nextImportedShots.length);
    }
  }, []);

  function addShot() {
    setState((current) => ({
      ...current,
      shots: [...current.shots, { id: createId("video-shot"), prompt: "", status: "pending" }],
    }));
  }

  function updatePrompt(id: string, prompt: string) {
    setState((current) => ({
      ...current,
      shots: current.shots.map((shot) => (shot.id === id ? { ...shot, prompt } : shot)),
    }));
  }

  function deleteShot(id: string) {
    setState((current) => {
      const shots = current.shots.filter((shot) => shot.id !== id);
      return { ...current, shots: shots.length ? shots : [{ id: createId("video-shot"), prompt: "", status: "pending" }] };
    });
  }

  function setModel(model: VideoModel) {
    setState((current) => ({ ...current, model }));
  }

  function markShotDone(id: string) {
    setState((current) => ({
      ...current,
      shots: current.shots.map((shot) => (shot.id === id ? { ...shot, status: "done" } : shot)),
    }));
  }

  function runMockQueue() {
    state.shots
      .filter((shot) => shot.status === "pending")
      .forEach((shot) => {
        setTimeout(() => markShotDone(shot.id), 1000);
      });
  }

  function exportJson() {
    console.log(JSON.stringify(state));
  }

  function importStoryboardShots() {
    if (!importedShots.length) return;
    setState((current) => ({ ...current, shots: importedShots }));
  }

  return (
    <main className="app-shell production-workbench-page simple-workbench-page">
      <header className="simple-workbench-header">
        <div>
          <span>{isZh ? "视频创作" : "Video Workbench"}</span>
          <h1>{isZh ? "视频工作台" : "Video Workbench"}</h1>
        </div>
        <button className="primary-button" type="button" onClick={exportJson}>
          <Download size={16} />
          {isZh ? "导出 JSON" : "Export JSON"}
        </button>
      </header>

      {importedShotCount > 0 ? (
        <section className="dashboard-panel simple-continuity-banner">
          <div>
            <strong>{isZh ? "Imported from Storyboard (local draft)" : "Imported from Storyboard (local draft)"}</strong>
            <span>{isZh ? "Continue from Storyboard" : "Continue from Storyboard"}</span>
          </div>
          <span className="simple-count-pill">{importedShotCount} shots</span>
          <button className="secondary-button" type="button" onClick={importStoryboardShots}>
            {isZh ? "导入本地 Shots" : "Import Local Shots"}
          </button>
        </section>
      ) : null}

      <section className="dashboard-panel simple-workbench-section">
        <div className="simple-section-head">
          <h2>{isZh ? "Shot List" : "Shot List"}</h2>
          <button className="secondary-button" type="button" onClick={addShot}>
            <Plus size={16} />
            {isZh ? "添加 Shot" : "Add Shot"}
          </button>
        </div>
        <div className="simple-shot-list">
          {state.shots.map((shot, index) => (
            <div className="simple-shot-row continuity-shot-card" key={shot.id}>
              <label>
                Shot {index + 1}
                <textarea value={shot.prompt} onChange={(event) => updatePrompt(shot.id, event.target.value)} />
              </label>
              <button className="icon-button" type="button" onClick={() => deleteShot(shot.id)} aria-label="Delete Shot">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <h2>{isZh ? "Model Selector" : "Model Selector"}</h2>
        <div className="simple-model-row">
          <button type="button" className={state.model === "seedance" ? "active" : ""} onClick={() => setModel("seedance")}>
            seedance
          </button>
          <button type="button" className={state.model === "minimax" ? "active" : ""} onClick={() => setModel("minimax")}>
            minimax
          </button>
        </div>
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <div className="simple-section-head">
          <h2>{isZh ? "Queue" : "Queue"}</h2>
          <button className="secondary-button" type="button" onClick={runMockQueue}>
            {isZh ? "模拟运行" : "Run Mock Queue"}
          </button>
        </div>
        <div className="simple-queue-list">
          {state.shots.map((shot, index) => (
            <div className="simple-queue-row" key={shot.id}>
              <strong>Shot {index + 1}</strong>
              <span data-status={shot.status}>{shot.status}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-panel simple-workbench-section">
        <h2>{isZh ? "Preview Grid" : "Preview Grid"}</h2>
        <div className="simple-preview-grid">
          {state.shots.map((shot, index) => (
            <div className="simple-preview-tile" key={shot.id}>
              <strong>Shot {index + 1}</strong>
              <span data-status={shot.status}>{shot.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
