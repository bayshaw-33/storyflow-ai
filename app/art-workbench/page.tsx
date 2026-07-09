"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Download, FileText, ImagePlus, PackagePlus, Plus, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { readProjectsFromStorage, type DramaProject } from "@/lib/projects";
import {
  artStateFromProject,
  assetsFromExtraction,
  createArtAsset,
  createArtId,
  createEmptyArtWorkbenchState,
  type ArtAsset,
  type ArtAssetKind,
  type ArtWorkbenchState,
  type ExtractedArtAssets,
} from "@/lib/art-workbench";

const STORAGE_KEY = "kiikis_art_workbench_state";

type ApiResult<T> = T & {
  success: boolean;
  error?: string;
  warning?: string;
};

export default function ArtWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [session, setSession] = useState<Session | null>(null);
  const [projects, setProjects] = useState<DramaProject[]>([]);
  const [state, setState] = useState<ArtWorkbenchState>(() => createEmptyArtWorkbenchState());
  const [selectedKind, setSelectedKind] = useState<ArtAssetKind>("character");
  const [sourceDraft, setSourceDraft] = useState("");
  const [busy, setBusy] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");

  const selectedAsset = useMemo(
    () => state.assets.find((asset) => asset.id === state.selectedAssetId) || state.assets.find((asset) => asset.kind === selectedKind) || null,
    [state.assets, state.selectedAssetId, selectedKind],
  );
  const visibleAssets = state.assets.filter((asset) => asset.kind === selectedKind);
  const assetCounts = {
    character: state.assets.filter((asset) => asset.kind === "character").length,
    scene: state.assets.filter((asset) => asset.kind === "scene").length,
    prop: state.assets.filter((asset) => asset.kind === "prop").length,
  };

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } = supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    setProjects(readProjectsFromStorage());
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as ArtWorkbenchState;
        setState({ ...createEmptyArtWorkbenchState(), ...parsed });
        setSourceDraft(parsed.sourceText || "");
      }
    } catch {
      // Ignore corrupted local state.
    }
    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Local persistence is best effort.
    }
  }, [state]);

  function patchState(patch: Partial<ArtWorkbenchState>) {
    setState((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function selectProject(projectId: string) {
    const project = projects.find((item) => item.id === projectId);
    if (!project) return;
    const patch = artStateFromProject(project);
    patchState(patch);
    setSourceDraft(patch.sourceText || "");
    setStatus(isZh ? "已载入项目资料，可继续上传角色圣经或直接拆解资产。" : "Project source loaded.");
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy("file");
    setError("");
    setStatus("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/files/parse", { method: "POST", body: formData });
      const payload = await response.json() as ApiResult<{ text: string; fileName?: string }>;
      if (!response.ok || !payload.success || !payload.text) throw new Error(payload.error || "File parse failed.");
      const nextFile = { id: createArtId("source"), name: payload.fileName || file.name, text: payload.text, addedAt: new Date().toISOString() };
      const nextText = [sourceDraft, `【${nextFile.name}】\n${nextFile.text}`].filter(Boolean).join("\n\n");
      setSourceDraft(nextText);
      patchState({ sourceText: nextText, sourceFiles: [nextFile, ...state.sourceFiles] });
      setStatus(isZh ? `已解析文件：${nextFile.name}` : `Parsed file: ${nextFile.name}`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : isZh ? "文件解析失败。" : "File parse failed.");
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function extractAssets() {
    if (!session?.access_token) {
      setError(isZh ? "请先登录后再使用 AI 拆解美术资产。" : "Sign in before extracting art assets.");
      return;
    }
    if (!sourceDraft.trim()) {
      setError(isZh ? "请先载入项目资料、上传文件或粘贴剧本。" : "Add project source first.");
      return;
    }
    setBusy("extract");
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/art/extract-assets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          title: state.title,
          visualStyle: state.visualStyle,
          sourceText: sourceDraft,
        }),
      });
      const payload = await response.json() as ApiResult<ExtractedArtAssets & { provider?: string; model?: string }>;
      if (!response.ok || !payload.success) throw new Error(payload.error || "Asset extraction failed.");
      const assets = assetsFromExtraction(payload);
      patchState({
        title: payload.title || state.title,
        visualStyle: payload.visualStyle || state.visualStyle,
        sourceText: sourceDraft,
        assets,
        selectedAssetId: assets[0]?.id,
      });
      setSelectedKind(assets[0]?.kind || "character");
      setStatus(payload.warning || (isZh ? `已生成 ${assets.length} 个美术资产初稿。` : `Generated ${assets.length} art assets.`));
    } catch (extractError) {
      setError(extractError instanceof Error ? extractError.message : isZh ? "美术资产拆解失败。" : "Asset extraction failed.");
    } finally {
      setBusy("");
    }
  }

  function addAsset(kind = selectedKind) {
    const asset = createArtAsset(kind);
    setState((current) => ({
      ...current,
      assets: [asset, ...current.assets],
      selectedAssetId: asset.id,
      updatedAt: new Date().toISOString(),
    }));
    setSelectedKind(kind);
  }

  function deleteAsset(assetId: string) {
    setState((current) => {
      const assets = current.assets.filter((asset) => asset.id !== assetId);
      return {
        ...current,
        assets,
        selectedAssetId: assets[0]?.id,
        updatedAt: new Date().toISOString(),
      };
    });
  }

  function updateAsset(assetId: string, patch: Partial<ArtAsset>) {
    setState((current) => ({
      ...current,
      assets: current.assets.map((asset) => asset.id === assetId ? { ...asset, ...patch, updatedAt: new Date().toISOString() } : asset),
      updatedAt: new Date().toISOString(),
    }));
  }

  async function generateImage(asset: ArtAsset, mode: "reference_sheet" | "three_view" | "concept") {
    if (!session?.access_token) {
      setError(isZh ? "请先登录后再生成图片。" : "Sign in before generating images.");
      return;
    }
    setBusy(`${asset.id}:${mode}`);
    setError("");
    setStatus("");
    updateAsset(asset.id, { status: "generating", error: "" });
    try {
      const response = await fetch("/api/art/generate-image", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ asset, mode, visualStyle: state.visualStyle, provider: "minimax" }),
      });
      const payload = await response.json() as ApiResult<{ imageUrl: string; provider?: string; model?: string }>;
      if (!response.ok || !payload.success || !payload.imageUrl) throw new Error(payload.error || "Image generation failed.");
      updateAsset(asset.id, {
        status: "ready",
        provider: payload.provider,
        model: payload.model,
        referenceSheetUrl: mode === "reference_sheet" ? payload.imageUrl : asset.referenceSheetUrl,
        threeViewUrl: mode === "three_view" ? payload.imageUrl : asset.threeViewUrl,
        conceptUrl: mode === "concept" ? payload.imageUrl : asset.conceptUrl,
      });
      setStatus(isZh ? "图片生成完成。" : "Image generated.");
    } catch (imageError) {
      updateAsset(asset.id, { status: "error", error: imageError instanceof Error ? imageError.message : "Image generation failed." });
      setError(imageError instanceof Error ? imageError.message : isZh ? "图片生成失败。" : "Image generation failed.");
    } finally {
      setBusy("");
    }
  }

  function saveSnapshot() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, sourceText: sourceDraft, updatedAt: new Date().toISOString() }));
    setStatus(isZh ? "美术工作台已保存到本地。" : "Art workbench saved locally.");
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({ ...state, sourceText: sourceDraft }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.title || "kiikis-art-workbench"}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell art-workbench-page">
      <header className="art-workbench-header">
        <div>
          <span>{isZh ? "美术工作台" : "Art Workbench"}</span>
          <input value={state.title} onChange={(event) => patchState({ title: event.target.value })} aria-label="Art project title" />
          <p>{isZh ? "从剧本、项目背景和角色圣经中拆解角色、场景和关键道具，并生成参考表与三视图。" : "Extract characters, scenes, and key props, then generate visual references."}</p>
        </div>
        <div className="art-header-actions">
          <button className="secondary-button" type="button" onClick={saveSnapshot}><Save size={16} />{isZh ? "保存" : "Save"}</button>
          <button className="secondary-button" type="button" onClick={exportJson}><Download size={16} />{isZh ? "导出" : "Export"}</button>
        </div>
      </header>

      {error ? <section className="dashboard-panel art-workbench-alert error">{error}</section> : null}
      {status ? <section className="dashboard-panel art-workbench-alert">{status}</section> : null}

      <section className="art-workbench-grid">
        <aside className="dashboard-panel art-source-panel">
          <div className="art-panel-head">
            <div>
              <span>{isZh ? "输入资料" : "Source"}</span>
              <h2>{isZh ? "剧本 / 背景 / 角色圣经" : "Script / Bible"}</h2>
            </div>
            <FileText size={18} />
          </div>

          <label className="art-field">
            <span>{isZh ? "选择已有项目" : "Existing project"}</span>
            <select value={state.projectId || ""} onChange={(event) => selectProject(event.target.value)}>
              <option value="">{isZh ? "不关联项目" : "No project"}</option>
              {projects.map((project) => <option key={project.id} value={project.id}>{project.title}</option>)}
            </select>
          </label>

          <label className="art-file-drop">
            <input
              className="visually-hidden-input"
              type="file"
              accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,.html,.htm,.xlsx"
              onChange={handleFileUpload}
              disabled={busy === "file"}
            />
            <PackagePlus size={18} />
            <strong>{busy === "file" ? (isZh ? "解析中..." : "Parsing...") : (isZh ? "上传资料文件" : "Upload source file")}</strong>
            <small>{isZh ? "支持剧本、角色圣经、项目背景、表格资料。" : "Script, bible, brief, and spreadsheet files."}</small>
          </label>

          <label className="art-field grow">
            <span>{isZh ? "资料文本" : "Source text"}</span>
            <textarea value={sourceDraft} onChange={(event) => setSourceDraft(event.target.value)} placeholder={isZh ? "也可以直接粘贴剧本、背景设定或角色圣经..." : "Paste script, background, or character bible..."} />
          </label>

          <label className="art-field">
            <span>{isZh ? "统一画风" : "Visual style"}</span>
            <textarea value={state.visualStyle} onChange={(event) => patchState({ visualStyle: event.target.value })} />
          </label>

          <button className="primary-button full" type="button" onClick={extractAssets} disabled={busy === "extract"}>
            {busy === "extract" ? <RefreshCw className="spin-icon" size={16} /> : <Sparkles size={16} />}
            {isZh ? "自动拆解美术资产" : "Extract art assets"}
          </button>
        </aside>

        <section className="dashboard-panel art-library-panel">
          <div className="art-panel-head is-row">
            <div>
              <span>{isZh ? "资产库" : "Asset Library"}</span>
              <h2>{isZh ? "角色 / 场景 / 道具" : "Characters / Scenes / Props"}</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => addAsset()}><Plus size={16} />{isZh ? "新增" : "Add"}</button>
          </div>

          <div className="art-kind-tabs">
            <button className={selectedKind === "character" ? "active" : ""} type="button" onClick={() => setSelectedKind("character")}>{isZh ? "角色" : "Characters"} <span>{assetCounts.character}</span></button>
            <button className={selectedKind === "scene" ? "active" : ""} type="button" onClick={() => setSelectedKind("scene")}>{isZh ? "场景" : "Scenes"} <span>{assetCounts.scene}</span></button>
            <button className={selectedKind === "prop" ? "active" : ""} type="button" onClick={() => setSelectedKind("prop")}>{isZh ? "道具" : "Props"} <span>{assetCounts.prop}</span></button>
          </div>

          <div className="art-asset-grid">
            {visibleAssets.length ? visibleAssets.map((asset) => (
              <article
                className={asset.id === selectedAsset?.id ? "art-asset-card active" : "art-asset-card"}
                key={asset.id}
                onClick={() => patchState({ selectedAssetId: asset.id })}
              >
                <div className="art-thumb">
                  {asset.referenceSheetUrl || asset.threeViewUrl || asset.conceptUrl ? (
                    <img src={asset.referenceSheetUrl || asset.threeViewUrl || asset.conceptUrl} alt={asset.name} />
                  ) : (
                    <ImagePlus size={22} />
                  )}
                </div>
                <div>
                  <strong>{asset.name}</strong>
                  <span>{asset.kind === "character" ? (asset.priority === "lead" ? "主角" : "角色") : asset.kind === "scene" ? "场景" : "道具"}</span>
                </div>
                <small>{asset.role || asset.description || "未填写说明"}</small>
              </article>
            )) : (
              <div className="art-empty">
                <p>{isZh ? "暂无资产。可以自动拆解，或手动新增。" : "No assets yet."}</p>
                <button className="secondary-button" type="button" onClick={() => addAsset()}><Plus size={16} />{isZh ? "手动新增" : "Add manually"}</button>
              </div>
            )}
          </div>
        </section>

        <aside className="dashboard-panel art-editor-panel">
          {selectedAsset ? (
            <>
              <div className="art-panel-head is-row">
                <div>
                  <span>{selectedAsset.kind === "character" ? (isZh ? "角色编辑" : "Character") : selectedAsset.kind === "scene" ? (isZh ? "场景编辑" : "Scene") : (isZh ? "道具编辑" : "Prop")}</span>
                  <h2>{selectedAsset.name}</h2>
                </div>
                <button className="icon-button" type="button" onClick={() => deleteAsset(selectedAsset.id)} aria-label="Delete asset"><Trash2 size={16} /></button>
              </div>

              <label className="art-field">
                <span>{isZh ? "名称" : "Name"}</span>
                <input value={selectedAsset.name} onChange={(event) => updateAsset(selectedAsset.id, { name: event.target.value })} />
              </label>
              {selectedAsset.kind === "character" ? (
                <label className="art-field">
                  <span>{isZh ? "角色级别" : "Priority"}</span>
                  <select value={selectedAsset.priority || "supporting"} onChange={(event) => updateAsset(selectedAsset.id, { priority: event.target.value as ArtAsset["priority"] })}>
                    <option value="lead">{isZh ? "主角" : "Lead"}</option>
                    <option value="supporting">{isZh ? "重要配角" : "Supporting"}</option>
                    <option value="minor">{isZh ? "次要角色" : "Minor"}</option>
                  </select>
                </label>
              ) : null}
              <label className="art-field">
                <span>{isZh ? "叙事功能" : "Role"}</span>
                <input value={selectedAsset.role} onChange={(event) => updateAsset(selectedAsset.id, { role: event.target.value })} />
              </label>
              <label className="art-field">
                <span>{isZh ? "设计说明" : "Description"}</span>
                <textarea value={selectedAsset.description} onChange={(event) => updateAsset(selectedAsset.id, { description: event.target.value })} />
              </label>
              <label className="art-field grow">
                <span>{isZh ? "可编辑提示词" : "Editable prompt"}</span>
                <textarea value={selectedAsset.prompt} onChange={(event) => updateAsset(selectedAsset.id, { prompt: event.target.value })} />
              </label>
              <label className="art-field">
                <span>{isZh ? "负面提示词" : "Negative prompt"}</span>
                <textarea value={selectedAsset.negativePrompt} onChange={(event) => updateAsset(selectedAsset.id, { negativePrompt: event.target.value })} />
              </label>

              <div className="art-generate-actions">
                {selectedAsset.kind === "character" ? (
                  <>
                    <button className="primary-button" type="button" onClick={() => generateImage(selectedAsset, "reference_sheet")} disabled={busy === `${selectedAsset.id}:reference_sheet`}>
                      {busy === `${selectedAsset.id}:reference_sheet` ? <RefreshCw className="spin-icon" size={16} /> : <Sparkles size={16} />}
                      {isZh ? "生成/修改参考表" : "Reference sheet"}
                    </button>
                    <button className="secondary-button" type="button" onClick={() => generateImage(selectedAsset, "three_view")} disabled={busy === `${selectedAsset.id}:three_view`}>
                      {busy === `${selectedAsset.id}:three_view` ? <RefreshCw className="spin-icon" size={16} /> : <ImagePlus size={16} />}
                      {isZh ? "生成三视图" : "Three-view"}
                    </button>
                  </>
                ) : (
                  <button className="primary-button" type="button" onClick={() => generateImage(selectedAsset, "concept")} disabled={busy === `${selectedAsset.id}:concept`}>
                    {busy === `${selectedAsset.id}:concept` ? <RefreshCw className="spin-icon" size={16} /> : <ImagePlus size={16} />}
                    {isZh ? "生成概念图" : "Generate concept"}
                  </button>
                )}
              </div>

              <div className="art-result-grid">
                <PreviewBlock title={isZh ? "角色参考表 / 概念图" : "Reference / Concept"} url={selectedAsset.referenceSheetUrl || selectedAsset.conceptUrl || ""} />
                {selectedAsset.kind === "character" ? <PreviewBlock title={isZh ? "三视图" : "Three-view"} url={selectedAsset.threeViewUrl || ""} /> : null}
              </div>
            </>
          ) : (
            <div className="art-empty">
              <p>{isZh ? "选择一个资产开始编辑提示词和生成图片。" : "Select an asset to edit and generate images."}</p>
            </div>
          )}
        </aside>
      </section>
    </main>
  );
}

function PreviewBlock({ title, url }: { title: string; url: string }) {
  return (
    <article className="art-preview-block">
      <strong>{title}</strong>
      {url ? <img src={url} alt={title} /> : <div><ImagePlus size={22} /></div>}
    </article>
  );
}
