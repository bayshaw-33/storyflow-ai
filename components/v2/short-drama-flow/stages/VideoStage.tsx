"use client";

import { memo } from "react";
import { Video, Lock, ArrowRight, CheckCircle2, RefreshCw, Zap } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ShortDramaData, VideoShotStatus } from "@/lib/client/v2/short-drama/types";
import { getStageCompletion } from "@/lib/client/v2/short-drama/flow-machine";
import { StageHeader } from "./StageHeader";
import styles from "../short-drama-flow.module.css";

export interface VideoStageProps {
  data: ShortDramaData;
  // 批量生成关键帧和视频（将 pending 镜头转为 completed/failed）
  onBatchGenerate: () => void;
  // 单镜重做
  onRedoShot: (shotId: string) => void;
  // 标记完成并推进到导出阶段
  onAdvance: () => void;
}

const SHOT_STATUS_CLASS: Record<VideoShotStatus, string> = {
  completed: styles.shotStatusCompleted,
  failed: styles.shotStatusFailed,
  pending: styles.shotStatusPending,
};

function VideoStageComponent({ data, onBatchGenerate, onRedoShot, onAdvance }: VideoStageProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const video = data.stages.video;
  const completion = getStageCompletion(data.stages, "video");

  const shotStatusLabel = (status: VideoShotStatus) =>
    isZh
      ? status === "completed"
        ? "已完成"
        : status === "failed"
          ? "失败"
          : "待生成"
      : status;

  return (
    <div className={styles.stageContainer}>
      <StageHeader title={isZh ? "视频阶段" : "Video"} status={video.status} locale={locale} />

      {video.status === "locked" ? (
        <div className={styles.lockedNotice}>
          <Lock size={14} />
          {isZh ? "该阶段未解锁，请先完成分镜阶段。" : "Stage locked."}
        </div>
      ) : (
        <>
          <div className={`${styles.completionBanner} ${completion.complete ? "" : styles.completionBannerWarn}`}>
            {completion.complete ? <CheckCircle2 size={14} style={{ color: "#7dd181" }} /> : <Video size={14} />}
            <span>{completion.reason}</span>
          </div>
          {completion.nextGuide && (
            <div className={styles.nextGuide}>
              <ArrowRight size={12} />
              {completion.nextGuide}
            </div>
          )}

          {/* 镜头任务（分镜转镜头） */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Video size={12} />
              {isZh ? "镜头任务（分镜转镜头）" : "Shots"}
            </h3>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.button} onClick={onBatchGenerate}>
                <Zap size={12} />
                {isZh ? "批量生成关键帧和视频" : "Batch generate"}
              </button>
            </div>
            {video.shots.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "暂无镜头，分镜确认后派生" : "No shots"}</div>
            ) : (
              <ul className={styles.shotList}>
                {video.shots.map((shot) => (
                  <li key={shot.id} className={styles.shotItem}>
                    <span className={`${styles.shotStatus} ${SHOT_STATUS_CLASS[shot.status]}`}>
                      {shotStatusLabel(shot.status)}
                    </span>
                    <span className={styles.frameDesc}>
                      {isZh ? "镜头" : "shot"} {shot.id}
                      {shot.url && <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.4)" }}>{shot.url}</span>}
                    </span>
                    {shot.failureReason && (
                      <span className={styles.packageReason} style={{ color: "#ff8b8b" }}>{shot.failureReason}</span>
                    )}
                    {shot.status !== "pending" && (
                      <button
                        type="button"
                        className={`${styles.button} ${styles.buttonDanger}`}
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={() => onRedoShot(shot.id)}
                      >
                        <RefreshCw size={10} />
                        {isZh ? "重做" : "redo"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {video.status === "current" && (
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onAdvance}
                disabled={!completion.complete}
              >
                {isZh ? "确认并进入导出阶段" : "Confirm & advance"}
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const VideoStage = memo(VideoStageComponent);
