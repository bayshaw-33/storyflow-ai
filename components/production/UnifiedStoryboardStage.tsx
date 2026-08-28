"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { DynamicGridEditor } from "./DynamicGridEditor";
import { WhiteModelPrevis } from "./WhiteModelPrevis";
import type { StoryboardScene } from "@/lib/storyboard/contracts";

export type StoryboardSubview = "shot_table" | "grids" | "motion" | "prompts" | "canvas";

export interface UnifiedStoryboardStageProps {
  projectId: string;
  workId: string;
  unitId: string | null;
  subview: StoryboardSubview;
  onSubviewChange: (subview: StoryboardSubview) => void;
  handoffId?: string | null;
  content?: Partial<Record<StoryboardSubview, ReactNode>>;
}

type FrameMap = Record<string, { imageUrl: string }>;
type PromptMap = Record<string, { imagePrompt: string; jimengVideoPrompt: string; negativePrompt: string }>;

export function StoryboardFrameGrid({ scenes, frames }: { scenes: StoryboardScene[]; frames: FrameMap }) {
  const shots = scenes.flatMap((scene) => scene.shots.map((shot) => ({ scene, shot })));
  return (
    <section style={{ padding: 24 }}>
      <h2 style={{ margin: "0 0 6px" }}>宫格参考</h2>
      <p style={{ color: "var(--ink-muted)", margin: "0 0 16px" }}>按场景查看已生成的关键帧，动态 4/6/9/12 宫格在“运动预览”中继续编辑。</p>
      {shots.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>尚无分镜图。</p> : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 12 }}>
          {shots.map(({ scene, shot }) => {
            const id = shot.id ?? shot.clientId ?? "";
            return (
              <article key={id} style={{ border: "1px solid rgba(255,255,255,.1)", borderRadius: 10, overflow: "hidden", background: "rgba(255,255,255,.03)" }}>
                <div style={{ aspectRatio: "9 / 16", background: "rgba(0,0,0,.35)" }}>
                  {frames[id]?.imageUrl ? <img src={frames[id].imageUrl} alt={`场${scene.order} 镜头${shot.order}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ padding: 12, color: "var(--ink-muted)", fontSize: 12 }}>未生成</div>}
                </div>
                <div style={{ padding: 10, fontSize: 12 }}>场 {scene.order} · 镜头 {shot.order}</div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function StoryboardPromptList({ scenes, prompts, onGenerate }: { scenes: StoryboardScene[]; prompts: PromptMap; onGenerate: () => void }) {
  const shots = scenes.flatMap((scene) => scene.shots.map((shot) => ({ scene, shot })));
  return (
    <section style={{ padding: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div><h2 style={{ margin: 0 }}>视频提示词</h2><p style={{ color: "var(--ink-muted)", margin: "6px 0 0" }}>提示词属于分镜产物，生成后可在视频阶段继续制作。</p></div>
        <button type="button" onClick={onGenerate} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(117,219,198,.5)", background: "rgba(117,219,198,.12)", color: "#75dbc6", fontWeight: 700 }}>为全部镜头生成</button>
      </div>
      <div style={{ display: "grid", gap: 12, marginTop: 18 }}>
        {shots.length === 0 ? <p style={{ color: "var(--ink-muted)" }}>尚无分镜。</p> : shots.map(({ scene, shot }) => {
          const id = shot.id ?? shot.clientId ?? "";
          const prompt = prompts[id];
          return <article key={id} style={{ padding: 14, border: "1px solid rgba(255,255,255,.1)", borderRadius: 10 }}><strong>场 {scene.order} · 镜头 {shot.order}</strong><p style={{ whiteSpace: "pre-wrap", color: "var(--ink-secondary)" }}>{prompt?.jimengVideoPrompt || "尚未生成视频提示词"}</p></article>;
        })}
      </div>
    </section>
  );
}

const SUBVIEWS: Array<{ id: StoryboardSubview; label: string }> = [
  { id: "shot_table", label: "镜头表" },
  { id: "grids", label: "宫格" },
  { id: "motion", label: "运动预览" },
  { id: "prompts", label: "视频提示词" },
  { id: "canvas", label: "画布" },
];

export function UnifiedStoryboardStage({
  projectId,
  workId,
  unitId,
  subview,
  onSubviewChange,
  handoffId,
  content,
}: UnifiedStoryboardStageProps) {
  const [previsOpen, setPrevisOpen] = useState(false);
  const fallbackMotion = handoffId ? (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end", padding: "16px 24px 0" }}>
        <button type="button" onClick={() => setPrevisOpen((value) => !value)} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(117,219,198,.5)", background: previsOpen ? "rgba(117,219,198,.14)" : "rgba(255,255,255,.04)", color: "#75dbc6", cursor: "pointer", fontWeight: 700 }}>
          {previsOpen ? "返回动态分镜" : "打开白模预演"}
        </button>
      </div>
      {previsOpen ? <WhiteModelPrevis projectId={projectId} workId={workId} unitId={unitId} /> : <DynamicGridEditor handoffId={handoffId} />}
    </>
  ) : (
    previsOpen ? <WhiteModelPrevis projectId={projectId} workId={workId} unitId={unitId} /> : (
      <div style={{ padding: 24, color: "var(--ink-muted)", textAlign: "center" }}>
        <p>请先在剧本阶段确认可用版本，再生成分镜运动预览。</p>
        <button type="button" onClick={() => setPrevisOpen(true)} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(117,219,198,.5)", background: "rgba(117,219,198,.12)", color: "#75dbc6", cursor: "pointer", fontWeight: 700 }}>打开白模预演</button>
      </div>
    )
  );

  return (
    <section aria-label="统一分镜工作台" data-testid="unified-storyboard-stage" data-project-id={projectId} data-work-id={workId} data-unit-id={unitId ?? ""}>
      <nav aria-label="分镜子视图" style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "16px 24px 0" }}>
        {SUBVIEWS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-current={subview === item.id ? "page" : undefined}
            onClick={() => onSubviewChange(item.id)}
            style={{
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${subview === item.id ? "rgba(117,219,198,.7)" : "rgba(255,255,255,.12)"}`,
              background: subview === item.id ? "rgba(117,219,198,.14)" : "rgba(255,255,255,.04)",
              color: subview === item.id ? "#75dbc6" : "var(--ink-secondary)",
              cursor: "pointer",
              fontWeight: 700,
            }}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div data-testid={`storyboard-subview-${subview}`}>
        {content?.[subview] ?? (subview === "motion" ? fallbackMotion : (
          <div style={{ padding: 40, color: "var(--ink-muted)", textAlign: "center" }}>
            当前子视图尚未绑定内容。
          </div>
        ))}
      </div>
    </section>
  );
}
