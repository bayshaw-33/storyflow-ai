"use client";

import { memo } from "react";
import { Film, Lock, ArrowRight, CheckCircle2, Clapperboard } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ShortDramaData } from "@/lib/client/v2/short-drama/types";
import { getStageCompletion } from "@/lib/client/v2/short-drama/flow-machine";
import { StageHeader } from "./StageHeader";
import styles from "../short-drama-flow.module.css";

export interface StoryboardStageProps {
  data: ShortDramaData;
  // 生成分镜帧（基于已确认场景）
  onGenerateFrames: () => void;
  // 切换帧确认
  onToggleFrameConfirm: (frameId: string) => void;
  // 标记完成并推进到视频阶段
  onAdvance: () => void;
}

function StoryboardStageComponent({ data, onGenerateFrames, onToggleFrameConfirm, onAdvance }: StoryboardStageProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const storyboard = data.stages.storyboard;
  const completion = getStageCompletion(data.stages, "storyboard");

  // 已确认资产自动带入（跨阶段传递展示）
  const confirmedScenes = data.stages.script.analysis.scenes.filter((s) =>
    data.stages.script.confirmed.sceneIds.includes(s.id),
  );

  return (
    <div className={styles.stageContainer}>
      <StageHeader title={isZh ? "分镜阶段" : "Storyboard"} status={storyboard.status} locale={locale} />

      {storyboard.status === "locked" ? (
        <div className={styles.lockedNotice}>
          <Lock size={14} />
          {isZh ? "该阶段未解锁，请先完成美术阶段。" : "Stage locked."}
        </div>
      ) : (
        <>
          <div className={`${styles.completionBanner} ${completion.complete ? "" : styles.completionBannerWarn}`}>
            {completion.complete ? <CheckCircle2 size={14} style={{ color: "#7dd181" }} /> : <Film size={14} />}
            <span>{completion.reason}</span>
          </div>
          {completion.nextGuide && (
            <div className={styles.nextGuide}>
              <ArrowRight size={12} />
              {completion.nextGuide}
            </div>
          )}

          {/* 已确认资产带入 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Clapperboard size={12} />
              {isZh ? "已确认场景（自动带入）" : "Confirmed scenes"}
            </h3>
            {confirmedScenes.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "无已确认场景" : "No confirmed scenes"}</div>
            ) : (
              <ul className={styles.candidateList}>
                {confirmedScenes.map((s) => (
                  <li key={s.id} className={styles.candidateItem}>
                    <div className={styles.candidateMain}>
                      <span className={styles.candidateName}>{s.name}</span>
                      <div className={styles.candidateSummary}>{s.summary}</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 分镜帧 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Film size={12} />
              {isZh ? "分镜帧（逐镜确认）" : "Frames"}
            </h3>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.button} onClick={onGenerateFrames}>
                <Film size={12} />
                {isZh ? "生成分镜帧" : "Generate frames"}
              </button>
            </div>
            {storyboard.frames.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "暂无分镜帧，请先生成" : "No frames"}</div>
            ) : (
              <ul className={styles.frameList}>
                {storyboard.frames.map((frame) => (
                  <li key={frame.id} className={styles.frameItem}>
                    <button
                      type="button"
                      className={styles.button}
                      style={{ padding: "4px 10px", fontSize: 11 }}
                      onClick={() => onToggleFrameConfirm(frame.id)}
                    >
                      {frame.confirmed ? <CheckCircle2 size={10} /> : <Film size={10} />}
                      {frame.confirmed ? (isZh ? "已确认" : "confirmed") : (isZh ? "确认" : "confirm")}
                    </button>
                    <span className={styles.frameDesc}>{frame.shotDescription}</span>
                    <span className={styles.candidateKind}>{frame.sceneRef}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {storyboard.status === "current" && (
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onAdvance}
                disabled={!completion.complete}
              >
                {isZh ? "确认并进入视频阶段" : "Confirm & advance"}
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const StoryboardStage = memo(StoryboardStageComponent);
