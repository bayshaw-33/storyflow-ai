"use client";

import { memo } from "react";
import { Palette, Lock, ArrowRight, CheckCircle2, Layers } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ShortDramaData } from "@/lib/client/v2/short-drama/types";
import { getStageCompletion, transferAssetsToArt } from "@/lib/client/v2/short-drama/flow-machine";
import { StageHeader } from "./StageHeader";
import styles from "../short-drama-flow.module.css";

export interface ArtStageProps {
  data: ShortDramaData;
  // 为候选生成美术母版（fixture 模拟）
  onGenerateAsset: (candidateId: string) => void;
  // 锁定主版本
  onLockMainVersion: (assetId: string, versionId: string) => void;
  // 标记完成并推进到分镜阶段
  onAdvance: () => void;
}

function ArtStageComponent({ data, onGenerateAsset, onLockMainVersion, onAdvance }: ArtStageProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const art = data.stages.art;
  const completion = getStageCompletion(data.stages, "art");
  // 继承自剧本的待确认候选（跨阶段传递）
  const pendingConfirm = art.pendingConfirm;

  return (
    <div className={styles.stageContainer}>
      <StageHeader title={isZh ? "美术阶段" : "Art"} status={art.status} locale={locale} />

      {art.status === "locked" ? (
        <div className={styles.lockedNotice}>
          <Lock size={14} />
          {isZh ? "该阶段未解锁，请先完成剧本阶段。" : "Stage locked."}
        </div>
      ) : (
        <>
          <div className={`${styles.completionBanner} ${completion.complete ? "" : styles.completionBannerWarn}`}>
            {completion.complete ? <CheckCircle2 size={14} style={{ color: "#7dd181" }} /> : <Palette size={14} />}
            <span>{completion.reason}</span>
          </div>
          {completion.nextGuide && (
            <div className={styles.nextGuide}>
              <ArrowRight size={12} />
              {completion.nextGuide}
            </div>
          )}

          {/* 继承自剧本的待确认候选 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Layers size={12} />
              {isZh ? "继承自剧本的待生成候选" : "Inherited from script"}
            </h3>
            {pendingConfirm.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "全部候选已生成美术母版" : "All generated"}</div>
            ) : (
              <ul className={styles.candidateList}>
                {pendingConfirm.map((c) => (
                  <li key={c.id} className={styles.candidateItem}>
                    <div className={styles.candidateMain}>
                      <div>
                        <span className={styles.candidateName}>{c.name}</span>
                        <span className={styles.candidateKind}>
                          {c.kind === "character" ? (isZh ? "角色" : "char") : c.kind === "scene" ? (isZh ? "场景" : "scene") : (isZh ? "道具" : "prop")}
                        </span>
                      </div>
                      <div className={styles.candidateSummary}>{c.summary}</div>
                    </div>
                    <button type="button" className={styles.button} onClick={() => onGenerateAsset(c.id)}>
                      <Palette size={12} />
                      {isZh ? "生成母版" : "Generate"}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* 美术资产与版本 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Palette size={12} />
              {isZh ? "美术资产与版本" : "Art assets"}
            </h3>
            {art.assets.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "暂无美术资产" : "No assets"}</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {art.assets.map((asset) => (
                  <div key={asset.id} className={styles.assetCard}>
                    <div className={styles.assetCardHeader}>
                      <span className={styles.assetName}>{asset.name}</span>
                      {asset.mainVersionId && (
                        <span className={styles.stageStatusBadge} style={{ background: "rgba(109,231,223,0.12)", color: "#6de7df" }}>
                          <Lock size={10} />
                          {isZh ? "主版本已锁定" : "main locked"}
                        </span>
                      )}
                    </div>
                    <div className={styles.versionList}>
                      {asset.versions.map((v) => {
                        const isMain = v.id === asset.mainVersionId;
                        const chipClass = [
                          styles.versionChip,
                          isMain ? styles.versionChipMain : v.locked ? styles.versionChipLocked : "",
                        ].filter(Boolean).join(" ");
                        return (
                          <button
                            key={v.id}
                            type="button"
                            className={chipClass}
                            onClick={() => onLockMainVersion(asset.id, v.id)}
                            disabled={isMain}
                            title={v.url}
                          >
                            {isMain && <CheckCircle2 size={10} />}
                            {isZh ? `版本 ${v.id.split("-").pop()}` : `v${v.id.split("-").pop()}`}
                            {v.locked && !isMain && <Lock size={10} />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {art.status === "current" && (
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onAdvance}
                disabled={!completion.complete}
              >
                {isZh ? "确认并进入分镜阶段" : "Confirm & advance"}
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const ArtStage = memo(ArtStageComponent);
