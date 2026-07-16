"use client";

import { type ChangeEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Clock, Download, FileUp, ImagePlus, MessageSquareText, Plus, Save, Send, Trash2, Video } from "lucide-react";
import { readProjectsFromStorage } from "@/lib/projects";
import {
  addProductionHistory,
  createEmptyProductionState,
  createProductionId,
  createProductionShot,
  deleteProductionShot,
  formatSeconds,
  moveProductionShot,
  productionStateFromProject,
  productionStateToMarkdown,
  productionTimelineItems,
  totalTimelineSeconds,
  updateProductionShot,
} from "@/lib/production/state";
import type {
  ProductionImageProvider,
  ProductionMode,
  ProductionProjectState,
  ProductionShot,
} from "@/lib/production/types";
import { readCreativeHandoff } from "@/lib/creative-handoff";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useProductionApi } from "@/lib/production/hooks";
import { ShotStatusBadge, ShotThumbnail, PromptViewer, ShotActionBar } from "./ShotCardParts";
import { VersionHistory, type VersionRecord, type VersionDiffResult } from "./VersionHistory";
import styles from "./ProductionWorkbench.module.css";

type Props = {
  initialMode?: ProductionMode;
};

const modeLabels: Array<{ id: ProductionMode; label: string }> = [
  { id: "planning", label: "剧本策划" },
  { id: "canvas", label: "分镜画布" },
  { id: "editor", label: "视频编辑" },
];

export function ProductionWorkbench({ initialMode = "planning" }: Props) {
  const [state, setState] = useState<ProductionProjectState>(() =>
    createEmptyProductionState({
      title: "连光都不肯碰我半分",
      mode: initialMode,
      shots: [
        createProductionShot({
          index: 1,
          sceneTitle: "浴缸边缘",
          duration: "5s",
          description: "镜头紧贴浴缸边缘，以极低频率水平滑行。浴缸内墨汁般的黑色液体静谧深邃。",
          composition: "极低机位，边缘构图，浴缸边缘占据画面下 1/3。",
          cameraMovement: "极慢速横移 Track，营造黑色电影压迫感。",
          imagePrompt: "经典黑白电影质感，极低机位拍摄白色浴缸，黑色液体微微反光，35mm 胶片颗粒。",
          videoPrompt: "镜头沿浴缸边缘缓慢横移，黑色液体保持轻微波纹，压抑安静。",
        }),
      ],
    }),
  );
  const [input, setInput] = useState("");
  const [session, setSession] = useState<Session | null>(null);
    const [notice, setNotice] = useState("");
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionList, setVersionList] = useState<VersionRecord[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [versionDiff, setVersionDiff] = useState<VersionDiffResult | null>(null);
  const selectedShot = state.shots.find((shot) => shot.id === state.selectedShotId) || state.shots[0];
  const timeline = useMemo(() => productionTimelineItems(state), [state]);
  const projectId = state.projectId || state.id || "draft";
  const api = useProductionApi(session, projectId);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlProjectId = params.get("projectId");
    const mode = params.get("mode") as ProductionMode | null;
    const saved = localStorage.getItem("kiikis_production_workbench_state");
    const handoff = params.get("handoff") === "creative" ? readCreativeHandoff(urlProjectId) : null;
    if (handoff) {
      setState(createEmptyProductionState({
        projectId: handoff.sourceProjectId,
        id: handoff.sourceProjectId,
        title: handoff.title,
        mode: mode || "planning",
        universeId: handoff.universeId,
        sourceSummary: handoff.manuscript,
        storyBrief: {
          logline: "",
          targetPlatform: "TikTok / Reels / Shorts",
          targetAudience: "overseas short drama viewers",
          storySummary: [handoff.projectBackground, handoff.worldAndOutline].filter(Boolean).join("\n\n"),
          notes: handoff.characterBible,
        },
        visualBible: {
          visualStyle: "cinematic vertical short drama, realistic lighting, production-ready visual continuity",
          colorPalette: "natural contrast, controlled highlights, production-ready skin tones",
          cameraRules: "prioritize readable 9:16 composition, emotional close-ups, and stable continuity",
          characterRules: handoff.characterBible || "keep face, wardrobe, age, body shape, and key props consistent",
          sceneRules: "keep location geography, lighting direction, and important props consistent",
          negativePrompt: "watermark, logo, unreadable text, distorted hands, inconsistent faces, low quality",
        },
        chatMessages: [{
          id: createProductionId("chat"),
          role: "assistant",
          content: `已接收《${handoff.title}》的创作资料、正文与 Universe。请告诉我分镜节奏、画幅或镜头数量要求，我会生成可编辑分镜。`,
          createdAt: new Date().toISOString(),
        }],
        shots: handoff.manuscript ? [createProductionShot({ index: 1, sceneTitle: handoff.title, description: handoff.manuscript.slice(0, 600), imagePrompt: handoff.manuscript.slice(0, 600) })] : [],
      }));
      return;
    }
    if (urlProjectId) {
      const project = readProjectsFromStorage().find((item) => item.id === urlProjectId);
      if (project) {
        setState(productionStateFromProject(project, mode || initialMode));
        return;
      }
    }
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Partial<ProductionProjectState>;
        setState(createEmptyProductionState({ ...parsed, mode: mode || parsed.mode || initialMode }));
      } catch {
        // Ignore stale local state.
      }
    }
  }, [initialMode]);

  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let active = true;
    void (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!active) return;
        setSession(data.session);
      } catch {
        // Ignore session hydration errors.
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5_000);
    return () => clearTimeout(timer);
  }, [notice]);

  const { pollStatus } = api.video;
  useEffect(() => {
    const pending = state.shots.filter((shot) => shot.status === "video_generating" && shot.videoTaskId);
    if (pending.length === 0) return;
    const interval = setInterval(() => {
      pending.forEach(async (shot) => {
        try {
          const result = await pollStatus(shot.id, shot.videoTaskId as string);
          if (result.status === "video_ready" && result.videoUrl) {
            setState((current) => updateProductionShot(current, shot.id, {
              status: "video_ready",
              videoUrl: result.videoUrl,
            }));
          } else if (result.status === "error") {
            setState((current) => updateProductionShot(current, shot.id, {
              status: "error",
              error: "视频生成失败",
            }));
          }
        } catch {
          // Ignore polling errors, will retry next interval.
        }
      });
    }, 10_000);
    return () => clearInterval(interval);
  }, [state.shots, pollStatus]);

  function patchState(patch: Partial<ProductionProjectState>) {
    setState((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }

  function selectMode(mode: ProductionMode) {
    patchState({ mode });
  }

  function selectShot(shotId: string) {
    patchState({ selectedShotId: shotId });
  }

  function addShot() {
    setState((current) => {
      const shot = createProductionShot({
        index: current.shots.length + 1,
        sceneTitle: `分镜 ${current.shots.length + 1}`,
        duration: "5s",
        description: "新的分镜画面。",
      });
      return addProductionHistory(
        {
          ...current,
          shots: [...current.shots, shot],
          selectedShotId: shot.id,
          mode: current.mode === "planning" ? current.mode : "canvas",
        },
        { type: "edit", title: "新增分镜", detail: `新增分镜 ${shot.index}`, shotId: shot.id },
      );
    });
  }

  function updateShot(shotId: string, patch: Partial<ProductionShot>) {
    setState((current) => updateProductionShot(current, shotId, patch));
  }

  function removeShot(shotId: string) {
    setState((current) => addProductionHistory(deleteProductionShot(current, shotId), { type: "delete", title: "删除分镜", detail: `删除分镜 ${shotId}`, shotId }));
  }

  function copyShot(shotId: string) {
    setState((current) => {
      const source = current.shots.find((shot) => shot.id === shotId);
      if (!source) return current;
      const copy = createProductionShot({
        index: current.shots.length + 1,
        sceneTitle: source.sceneTitle,
        shotType: source.shotType,
        duration: source.duration,
        description: source.description,
        composition: source.composition,
        cameraMovement: source.cameraMovement,
        imagePrompt: source.imagePrompt,
        videoPrompt: source.videoPrompt,
        dialogue: source.dialogue,
        sound: source.sound,
        continuity: source.continuity,
        characterRefs: source.characterRefs,
        sceneRefs: source.sceneRefs,
      });
      return addProductionHistory(
        {
          ...current,
          shots: [...current.shots, copy],
          selectedShotId: copy.id,
        },
        { type: "edit", title: "复制分镜", detail: `复制分镜 ${source.index}`, shotId: copy.id },
      );
    });
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || api.chat.loading) return;
    const now = new Date().toISOString();
    setInput("");
    setState((current) => addProductionHistory({
      ...current,
      chatMessages: [
        ...current.chatMessages,
        { id: createProductionId("chat"), role: "user", content, createdAt: now },
      ],
    }, { type: "chat", title: "对话更新", detail: content }));
    try {
      const result = await api.chat.send(content, state);
      setState((current) => addProductionHistory({
        ...current,
        shots: result.shots.length ? result.shots : current.shots,
        selectedShotId: current.selectedShotId || result.shots[0]?.id || current.shots[0]?.id || "",
        chatMessages: [
          ...current.chatMessages,
          { id: createProductionId("chat"), role: "assistant", content: result.reply, createdAt: new Date().toISOString() },
        ],
      }, { type: "chat", title: "AI 回复", detail: result.reply.slice(0, 80) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "对话失败，请稍后再试。";
      setNotice(message);
    }
  }

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const sourceFile = await api.upload.upload(file);
      setState((current) => addProductionHistory({
        ...current,
        sourceFiles: [sourceFile, ...current.sourceFiles],
        sourceSummary: [sourceFile.extractedText?.slice(0, 1600) || "", current.sourceSummary].filter(Boolean).join("\n\n"),
        chatMessages: [
          ...current.chatMessages,
          {
            id: createProductionId("chat"),
            role: "assistant",
            content: `已读取资料《${file.name}》，可以基于它拆分镜。`,
            createdAt: new Date().toISOString(),
          },
        ],
      }, { type: "upload", title: "上传资料", detail: file.name }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "文件上传失败，请稍后再试。";
      setNotice(message);
    } finally {
      event.target.value = "";
    }
  }

  async function generateImage(shotId: string) {
    updateShot(shotId, { status: "image_generating", error: undefined });
    try {
      const result = await api.image.generate(shotId);
      updateShot(shotId, {
        imageUrl: result.imageUrl,
        status: "image_ready",
        imageProvider: result.provider as ProductionImageProvider,
      });
      setNotice("图片生成完成。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "图片生成失败，请稍后再试。";
      updateShot(shotId, { status: "error", error: message });
      setNotice(message);
    }
  }

  async function generateVideo(shotId: string) {
    updateShot(shotId, { status: "video_generating", error: undefined });
    try {
      const result = await api.video.generate(shotId);
      updateShot(shotId, { videoTaskId: result.taskId });
      setNotice("视频生成已提交，正在轮询状态。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "视频生成请求失败，请稍后再试。";
      updateShot(shotId, { status: "error", error: message });
      setNotice(message);
    }
  }

  async function saveAll() {
    localStorage.setItem("kiikis_production_workbench_state", JSON.stringify(state));
    setState((current) => addProductionHistory(current, { type: "save", title: "保存工作台", detail: "已保存到本地工作台状态。" }));
    if (!session) {
      setNotice("已保存到本地（未登录，未同步云端）。");
      return;
    }
    try {
      await api.sync.saveToCloud(state);
      // Auto-create version snapshot
      try {
        await api.versions.createVersion({
          entityType: "production_workbench",
          entityId: projectId,
          snapshotText: state.title,
          snapshotJson: { productionState: state },
          source: "manual",
        });
      } catch {
        // Version snapshot failure is non-fatal
      }
      setNotice("已同步到云端，版本快照已保存。");
    } catch (err) {
      const message = err instanceof Error ? err.message : "云端同步失败。";
      setNotice(`云端同步失败：${message}`);
    }
  }

  async function openVersionHistory() {
    setShowVersionHistory(true);
    setVersionDiff(null);
    setSelectedVersionId(null);
    const versions = await api.versions.listVersions("production_workbench", projectId);
    setVersionList(versions);
  }

  function closeVersionHistory() {
    setShowVersionHistory(false);
    setVersionDiff(null);
    setSelectedVersionId(null);
  }

  function handleSelectVersion(versionId: string) {
    setSelectedVersionId(versionId);
    setVersionDiff(null);
  }

  async function handleRestoreVersion(versionId: string) {
    const restored = await api.versions.restoreVersion(versionId);
    if (restored) {
      // Reload from cloud to get the restored state
      try {
        const restoredState = await api.sync.loadFromCloud();
        if (restoredState) {
          setState(restoredState);
          setNotice("已恢复到历史版本，请刷新查看完整状态。");
        }
      } catch {
        setNotice("版本已恢复，请重新加载工作台查看。");
      }
      // Refresh version list
      const versions = await api.versions.listVersions("production_workbench", projectId);
      setVersionList(versions);
    }
  }

  async function handleCompareVersions(versionA: string, versionB: string) {
    const diff = await api.versions.compareVersions(versionA, versionB);
    if (diff) {
      setVersionDiff(diff as unknown as VersionDiffResult);
    }
  }

  function exportMarkdown() {
    const blob = new Blob([productionStateToMarkdown(state)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${state.title || "production-workbench"}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <p className={styles.eyebrow}>Kiikis Production Workbench</p>
          <input className={styles.titleInput} value={state.title} onChange={(event) => patchState({ title: event.target.value })} aria-label="Project title" />
        </div>
        <nav className={styles.modeSwitch} aria-label="Production mode">
          {modeLabels.map((mode) => (
            <button
              className={`${styles.modeButton} ${state.mode === mode.id ? styles.modeButtonActive : ""}`}
              key={mode.id}
              type="button"
              onClick={() => selectMode(mode.id)}
            >
              {mode.label}
            </button>
          ))}
        </nav>
        <div className={styles.actionRow}>
          <button className={styles.secondaryButton} type="button" onClick={openVersionHistory}><Clock size={16} /> 版本历史</button>
          <button className={styles.secondaryButton} type="button" onClick={saveAll}><Save size={16} /> 保存</button>
          <button className={styles.primaryButton} type="button" onClick={exportMarkdown}><Download size={16} /> 导出</button>
        </div>
      </header>

      {notice ? (
        <div
          role="status"
          style={{
            margin: "12px 24px 0",
            padding: "10px 14px",
            borderRadius: 10,
            background: "rgba(117, 219, 198, 0.12)",
            border: "1px solid rgba(117, 219, 198, 0.35)",
            color: "#75dbc6",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {notice}
        </div>
      ) : null}

      <section className={styles.workspace}>
        <aside className={styles.chatPanel}>
          <div className={styles.panelHeader}>
            <h2><MessageSquareText size={17} /> AI 制片对话</h2>
            <p>上传剧本、设定或直接提出修改意见。右侧分镜会保持可编辑状态。</p>
          </div>

          <div className={styles.messages}>
            {state.chatMessages.length === 0 ? (
              <div className={styles.message}>
                <span className={styles.messageMeta}>KK</span>
                创作者大人，请上传剧本或告诉我你想做的短剧 / MV。我会先生成可编辑分镜，再进入图片和视频制作。
              </div>
            ) : null}
            {state.chatMessages.map((message) => (
              <div className={`${styles.message} ${message.role === "user" ? styles.messageUser : ""}`} key={message.id}>
                <span className={styles.messageMeta}>{message.role === "user" ? "你" : "KK"}</span>
                {message.content}
              </div>
            ))}
          </div>

          <label className={styles.uploadBox}>
            <FileUp size={16} /> {api.upload.loading ? "解析资料中..." : "上传剧本 / 背景设定 / 角色设定"}
            <input className={styles.fileInput} type="file" accept=".txt,.md,.json,.csv,.doc,.docx,.pdf,.html,.xlsx" onChange={handleFileUpload} disabled={api.upload.loading} />
          </label>

          {selectedShot ? <CurrentShotPanel shot={selectedShot} onUpdate={(patch) => updateShot(selectedShot.id, patch)} /> : null}

          <div className={styles.composer}>
            <textarea
              className={styles.textarea}
              value={input}
              placeholder="输入你的想法，例如：把总镜头控制在30个以内，增加长镜头，强化男女主对峙。"
              onChange={(event) => setInput(event.target.value)}
            />
            <button className={styles.primaryButton} type="button" onClick={sendMessage} disabled={api.chat.loading} aria-label="Send message"><Send size={18} /></button>
          </div>
        </aside>

        <section className={styles.mainPanel}>
          <div className={styles.mainHeader}>
            <div>
              <h2 className={styles.sectionTitle}>{modeLabels.find((mode) => mode.id === state.mode)?.label}</h2>
              <p className={styles.muted}>{state.shots.length} 个分镜 · 预计 {formatSeconds(totalTimelineSeconds(state))} · {state.aspectRatio}</p>
            </div>
            <div className={styles.actionRow}>
              <button className={styles.secondaryButton} type="button" onClick={addShot}><Plus size={16} /> 新增分镜</button>
            </div>
          </div>
          <div className={styles.mainBody}>
            {state.mode === "planning" ? (
              <PlanningMode state={state} patchState={patchState} updateShot={updateShot} removeShot={removeShot} selectShot={selectShot} copyShot={copyShot} generateImage={generateImage} />
            ) : null}
            {state.mode === "canvas" ? (
              <CanvasMode state={state} selectShot={selectShot} removeShot={removeShot} moveShot={(id, direction) => setState((current) => moveProductionShot(current, id, direction))} generateImage={generateImage} generateVideo={generateVideo} />
            ) : null}
            {state.mode === "editor" ? (
              <EditorMode state={state} selectedShot={selectedShot} timeline={timeline} selectShot={selectShot} updateShot={updateShot} />
            ) : null}
          </div>
        </section>
      </section>
      {showVersionHistory ? (
        <VersionHistory
          versions={versionList}
          loading={api.versions.loading}
          error={api.versions.error}
          onSelect={handleSelectVersion}
          onRestore={handleRestoreVersion}
          onCompare={handleCompareVersions}
          diff={versionDiff}
          selectedVersionId={selectedVersionId}
          onClose={closeVersionHistory}
        />
      ) : null}
    </main>
  );
}

function CurrentShotPanel({ shot, onUpdate }: { shot: ProductionShot; onUpdate: (patch: Partial<ProductionShot>) => void }) {
  return (
    <div className={styles.currentShot}>
      <strong>当前分镜 {shot.index}</strong>
      <p className={styles.muted}>{shot.sceneTitle} · {shot.duration} · {shot.status}</p>
      <div className={styles.promptBlock}>
        <strong>图片提示词</strong>
        <textarea className={styles.shotTextarea} value={shot.imagePrompt} onChange={(event) => onUpdate({ imagePrompt: event.target.value })} />
      </div>
      <div className={styles.promptBlock}>
        <strong>视频提示词</strong>
        <textarea className={styles.shotTextarea} value={shot.videoPrompt} onChange={(event) => onUpdate({ videoPrompt: event.target.value })} />
      </div>
    </div>
  );
}

function PlanningMode({
  state,
  patchState,
  updateShot,
  removeShot,
  selectShot,
  copyShot,
  generateImage,
}: {
  state: ProductionProjectState;
  patchState: (patch: Partial<ProductionProjectState>) => void;
  updateShot: (shotId: string, patch: Partial<ProductionShot>) => void;
  removeShot: (shotId: string) => void;
  selectShot: (shotId: string) => void;
  copyShot: (shotId: string) => void;
  generateImage: (shotId: string) => void;
}) {
  return (
    <div className={styles.planningGrid}>
      <aside className={styles.settingsPanel}>
        <h3 className={styles.sectionTitle}>项目设定</h3>
        <div className={styles.formGrid}>
          <label>内容类型
            <select className={styles.select} value={state.contentType} onChange={(event) => patchState({ contentType: event.target.value as ProductionProjectState["contentType"] })}>
              <option value="short_drama">短剧</option>
              <option value="mv">MV</option>
            </select>
          </label>
          <label>画幅
            <select className={styles.select} value={state.aspectRatio} onChange={(event) => patchState({ aspectRatio: event.target.value as ProductionProjectState["aspectRatio"] })}>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
            </select>
          </label>
          <label>故事概况
            <textarea
              className={styles.shotTextarea}
              value={state.storyBrief.storySummary}
              onChange={(event) => patchState({ storyBrief: { ...state.storyBrief, storySummary: event.target.value } })}
            />
          </label>
          <label>视觉风格
            <textarea
              className={styles.shotTextarea}
              value={state.visualBible.visualStyle}
              onChange={(event) => patchState({ visualBible: { ...state.visualBible, visualStyle: event.target.value } })}
            />
          </label>
        </div>
      </aside>
      <section className={styles.documentPanel}>
        <h3 className={styles.sectionTitle}>分镜剧本</h3>
        {state.shots.map((shot) => (
          <article className={styles.documentShot} key={shot.id}>
            <h3>分镜 {shot.index}</h3>
            <ul>
              <li>画面类型：{shot.shotType}</li>
              <li>分镜时长：{shot.duration}</li>
              <li>画面描述：{shot.description}</li>
              <li>构图设计：{shot.composition}</li>
              <li>运镜调度：{shot.cameraMovement}</li>
            </ul>
            <div className={styles.shotActions}>
              <button className={styles.secondaryButton} type="button" onClick={() => selectShot(shot.id)}>编辑</button>
              <button className={styles.secondaryButton} type="button" onClick={() => copyShot(shot.id)}>复制</button>
              <button className={styles.secondaryButton} type="button" onClick={() => generateImage(shot.id)}><ImagePlus size={15} /> 生成图片</button>
              <button className={styles.iconButton} type="button" onClick={() => removeShot(shot.id)} aria-label="删除分镜"><Trash2 size={15} /></button>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

function CanvasMode({
  state,
  selectShot,
  removeShot,
  moveShot,
  generateImage,
  generateVideo,
}: {
  state: ProductionProjectState;
  selectShot: (shotId: string) => void;
  removeShot: (shotId: string) => void;
  moveShot: (shotId: string, direction: "up" | "down") => void;
  generateImage: (shotId: string) => void;
  generateVideo: (shotId: string) => void;
}) {
  return (
    <div className={styles.canvasGrid}>
      {state.shots.map((shot) => (
        <div
          className={`${styles.shotCard} ${state.selectedShotId === shot.id ? styles.shotCardActive : ""}`}
          key={shot.id}
          role="button"
          tabIndex={0}
          onClick={() => selectShot(shot.id)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              selectShot(shot.id);
            }
          }}
        >
          <ShotThumbnail imageUrl={shot.imageUrl} videoUrl={shot.videoUrl} status={shot.status} aspectRatio={state.aspectRatio} />
          <h3>分镜 {shot.index}</h3>
          <p className={styles.muted}>{shot.description.slice(0, 82) || "暂无画面描述"}</p>
          <div className={styles.badgeRow}>
            <span className={styles.badge}>{shot.shotType}</span>
            <span className={styles.badge}>{shot.duration}</span>
            <ShotStatusBadge status={shot.status} />
          </div>
          <div onClick={(event) => event.stopPropagation()}>
            <ShotActionBar
              status={shot.status}
              mode="canvas"
              onGenerateImage={() => generateImage(shot.id)}
              onGenerateVideo={() => generateVideo(shot.id)}
              onDelete={() => removeShot(shot.id)}
              onMoveUp={() => moveShot(shot.id, "up")}
              onMoveDown={() => moveShot(shot.id, "down")}
              onSelect={() => selectShot(shot.id)}
            />
          </div>
          <PromptViewer imagePrompt={shot.imagePrompt} videoPrompt={shot.videoPrompt} shotType={shot.shotType} duration={shot.duration} />
        </div>
      ))}
    </div>
  );
}

function EditorMode({
  state,
  selectedShot,
  timeline,
  selectShot,
  updateShot,
}: {
  state: ProductionProjectState;
  selectedShot?: ProductionShot;
  timeline: ReturnType<typeof productionTimelineItems>;
  selectShot: (shotId: string) => void;
  updateShot: (shotId: string, patch: Partial<ProductionShot>) => void;
}) {
  return (
    <div className={styles.editorGrid}>
      <aside className={styles.editorAside}>
        <h3 className={styles.sectionTitle}>当前镜头</h3>
        {selectedShot ? (
          <div className={styles.formGrid}>
            <label>场景标题
              <input className={styles.field} value={selectedShot.sceneTitle} onChange={(event) => updateShot(selectedShot.id, { sceneTitle: event.target.value })} />
            </label>
            <label>时长
              <input className={styles.field} value={selectedShot.duration} onChange={(event) => updateShot(selectedShot.id, { duration: event.target.value })} />
            </label>
            <label>画面描述
              <textarea className={styles.shotTextarea} value={selectedShot.description} onChange={(event) => updateShot(selectedShot.id, { description: event.target.value })} />
            </label>
            <label>图片 URL
              <input className={styles.field} value={selectedShot.imageUrl || ""} onChange={(event) => updateShot(selectedShot.id, { imageUrl: event.target.value, status: event.target.value ? "image_ready" : "draft" })} />
            </label>
            <label>视频 URL
              <input className={styles.field} value={selectedShot.videoUrl || ""} onChange={(event) => updateShot(selectedShot.id, { videoUrl: event.target.value, status: event.target.value ? "video_ready" : selectedShot.status })} />
            </label>
          </div>
        ) : <p className={styles.muted}>请选择一个分镜。</p>}
      </aside>
      <section className={styles.previewStage}>
        <div className={styles.previewFrame}>
          {selectedShot ? <ShotPreview shot={selectedShot} /> : "No shot selected"}
        </div>
      </section>
      <section className={styles.timeline}>
        <div className={styles.timelineControls}>
          <strong><Video size={16} /> 时间线</strong>
          <span className={styles.muted}>{timeline.length} clips · {formatSeconds(totalTimelineSeconds(state))}</span>
        </div>
        <div className={styles.timelineTrack}>
          {timeline.map((item) => (
            <button
              className={`${styles.timelineClip} ${state.selectedShotId === item.shotId ? styles.timelineClipActive : ""}`}
              key={item.shotId}
              type="button"
              onClick={() => selectShot(item.shotId)}
            >
              <div className={styles.timelineClipThumb}>
                {item.videoUrl ? <video src={item.videoUrl} muted /> : item.imageUrl ? <img src={item.imageUrl} alt="" /> : null}
              </div>
              <div className={styles.timelineClipText}>分镜 {item.index}<br />{formatSeconds(item.durationSeconds)}</div>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ShotPreview({ shot }: { shot: ProductionShot }) {
  if (shot.videoUrl) return <video src={shot.videoUrl} controls />;
  if (shot.imageUrl) return <img src={shot.imageUrl} alt={`分镜 ${shot.index}`} />;
  return <span>等待图片或视频素材</span>;
}
