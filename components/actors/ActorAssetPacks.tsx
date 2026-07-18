"use client";

import { Expand, ImageOff, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { ActorProfile } from "@/lib/actors";
import type { ActorLibraryCopy } from "./actor-copy";
import { ACTOR_VIEW_PACKS, type ViewPackId, type ViewVersion } from "./actor-view-model";
import styles from "./actors.module.css";

type Props = {
  actor: ActorProfile;
  isZh: boolean;
  copy: ActorLibraryCopy;
  versionsByPack: Record<string, ViewVersion[]>;
  packBusy: string;
  packErrors: Record<string, string>;
  historyFailed: boolean;
  onGenerate: (pack: ViewPackId) => void;
};

// 详情页右侧图片资产区：主视觉 + 每个视图包一组独立图片，含空态 / 生成中 / 失败降级态。
export function ActorAssetPacks({ actor, isZh, copy, versionsByPack, packBusy, packErrors, historyFailed, onGenerate }: Props) {
  return (
    <>
      <section className={styles.assetSection} aria-label={copy.mainVisual}>
        <div className={styles.assetSectionHead}>
          <h2>{copy.mainVisual}</h2>
        </div>
        {actor.avatar_url ? (
          <div className={styles.mainVisual}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={actor.avatar_url} alt={`${actor.name} · ${copy.mainVisual}`} />
          </div>
        ) : (
          <div className={styles.packEmptyBox}>
            <ImageOff size={20} />
            <span>{copy.noMainVisual}</span>
          </div>
        )}
      </section>

      {historyFailed ? <div className={styles.packErrorBox}>{copy.packLoadFailed}</div> : null}

      {ACTOR_VIEW_PACKS.map((pack) => {
        const versions = versionsByPack[pack.id] || [];
        const busy = packBusy === pack.id;
        const error = packErrors[pack.id] || "";
        return (
          <section className={styles.assetSection} key={pack.id} aria-label={isZh ? pack.zh : pack.en}>
            <div className={styles.assetSectionHead}>
              <h2>{isZh ? pack.zh : pack.en}</h2>
              {versions.length ? (
                <span className={styles.assetCount}>
                  {versions.length} {isZh ? "张" : "images"}
                </span>
              ) : null}
              <span className={styles.spacer} />
              <button className={styles.ghostBtn} type="button" onClick={() => onGenerate(pack.id)} disabled={Boolean(packBusy)}>
                {busy ? <LoaderCircle className={styles.spin} size={14} /> : versions.length ? <RefreshCw size={14} /> : <Sparkles size={14} />}
                {busy ? copy.generating : versions.length ? copy.regenerate : copy.generate}
              </button>
            </div>

            {error ? (
              <div className={styles.packErrorBox} role="alert">
                <span>{copy.packError}</span>
                <span>{error}</span>
              </div>
            ) : null}

            {versions.length ? (
              <div className={styles.packGrid}>
                {versions.map((version) => (
                  <figure className={styles.packItem} key={version.versionId} style={{ margin: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={version.previewUrl} alt={`${actor.name} · ${isZh ? pack.zh : pack.en}`} loading="lazy" />
                    <a href={version.previewUrl} target="_blank" rel="noreferrer" aria-label={copy.viewOpen}>
                      <span className={styles.zoomHint}>
                        <Expand size={11} />
                        {copy.viewOpen}
                      </span>
                    </a>
                  </figure>
                ))}
              </div>
            ) : busy ? (
              <div className={styles.packGrid}>
                {[0, 1, 2].map((index) => (
                  <div className={styles.skeletonCard} key={index} />
                ))}
              </div>
            ) : (
              <div className={styles.packEmptyBox}>
                <ImageOff size={20} />
                <span>{copy.packEmpty}</span>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}
