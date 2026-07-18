"use client";

import { useRef, useState } from "react";
import { Expand, ImageOff, LoaderCircle, RefreshCw, Sparkles, Star, Upload } from "lucide-react";
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
  versionErrors: Record<string, string>;
  historyFailed: boolean;
  onGenerate: (pack: ViewPackId) => void;
  onSetPrimary: (pack: ViewPackId, versionId: string) => void;
  /**
   * 上传图片到指定 pack。前端把 File 传给父组件，由父组件调用 upload API。
   * KIIKIS-TR-ACTOR-P0-007: 用户可上传图片替代生成。
   */
  onUpload: (pack: ViewPackId, file: File) => Promise<void>;
};

// 详情页右侧图片资产区：
// 主视觉（reference-sheet 优先，avatar 回退）+ 5 个视图包
// （角色参考表 / 白T三视图 / 泳装三视图 / 表情组 / 身体细节）。
// 每个 pack 支持生成与上传两种方式，单张失败不清空其他版本。
export function ActorAssetPacks({
  actor,
  isZh,
  copy,
  versionsByPack,
  packBusy,
  packErrors,
  versionErrors,
  historyFailed,
  onGenerate,
  onSetPrimary,
  onUpload,
}: Props) {
  // 主视觉优先用 reference-sheet 主版本，否则回退到 avatar
  const refSheetVersions = versionsByPack["reference-sheet"] || [];
  const refSheetPrimary = refSheetVersions.find((v) => v.isPrimary) || refSheetVersions[0] || null;
  const mainVisualUrl = refSheetPrimary?.previewUrl || actor.avatar_url || "";

  return (
    <>
      <section className={styles.assetSection} aria-label={copy.mainVisual}>
        <div className={styles.assetSectionHead}>
          <h2>{copy.mainVisual}</h2>
          <span className={styles.spacer} />
          <UploadButton
            pack="reference-sheet"
            copy={copy}
            disabled={Boolean(packBusy)}
            onUpload={onUpload}
          />
          <button
            className={styles.ghostBtn}
            type="button"
            onClick={() => onGenerate("reference-sheet")}
            disabled={Boolean(packBusy)}
          >
            {packBusy === "reference-sheet" ? <LoaderCircle className={styles.spin} size={14} /> : refSheetVersions.length ? <RefreshCw size={14} /> : <Sparkles size={14} />}
            {packBusy === "reference-sheet" ? copy.generating : refSheetVersions.length ? copy.regenerate : copy.generate}
          </button>
        </div>
        {mainVisualUrl ? (
          <div className={styles.mainVisual}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mainVisualUrl} alt={`${actor.name} · ${copy.mainVisual}`} />
          </div>
        ) : (
          <div className={styles.packEmptyBox}>
            <ImageOff size={20} />
            <span>{copy.noMainVisual}</span>
          </div>
        )}
      </section>

      {historyFailed ? (
        <div className={styles.packErrorBox} role="alert">
          {copy.packLoadFailed}
        </div>
      ) : null}

      {ACTOR_VIEW_PACKS.filter((pack) => pack.id !== "reference-sheet").map((pack) => {
        const versions = versionsByPack[pack.id] || [];
        const busy = packBusy === pack.id;
        const packError = packErrors[pack.id] || "";
        return (
          <PackSection
            key={pack.id}
            pack={pack}
            isZh={isZh}
            copy={copy}
            actorName={actor.name}
            versions={versions}
            busy={busy}
            packError={packError}
            versionErrors={versionErrors}
            disabled={Boolean(packBusy)}
            onGenerate={onGenerate}
            onSetPrimary={onSetPrimary}
            onUpload={onUpload}
          />
        );
      })}
    </>
  );
}

type PackSectionProps = {
  pack: (typeof ACTOR_VIEW_PACKS)[number];
  isZh: boolean;
  copy: ActorLibraryCopy;
  actorName: string;
  versions: ViewVersion[];
  busy: boolean;
  packError: string;
  versionErrors: Record<string, string>;
  disabled: boolean;
  onGenerate: (pack: ViewPackId) => void;
  onSetPrimary: (pack: ViewPackId, versionId: string) => void;
  onUpload: (pack: ViewPackId, file: File) => Promise<void>;
};

function PackSection(props: PackSectionProps) {
  const { pack, isZh, copy, actorName, versions, busy, packError, versionErrors, disabled, onGenerate, onSetPrimary, onUpload } = props;
  const [historyOpen, setHistoryOpen] = useState(false);
  const packLabel = isZh ? pack.zh : pack.en;
  const primary = versions.find((version) => version.isPrimary) || versions[0] || null;
  const historyVersions = primary ? versions.filter((version) => version.versionId !== primary.versionId) : versions;

  return (
    <section className={styles.assetSection} aria-label={packLabel}>
      <div className={styles.assetSectionHead}>
        <h2>{packLabel}</h2>
        {versions.length ? <span className={styles.assetCount}>{copy.versionCount(versions.length)}</span> : null}
        <span className={styles.spacer} />
        {versions.length ? (
          <button
            className={styles.ghostBtn}
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            aria-expanded={historyOpen}
            disabled={disabled || historyVersions.length === 0}
            title={copy.versionHistory}
          >
            {copy.versionHistory} · {historyVersions.length}
          </button>
        ) : null}
        <UploadButton
          pack={pack.id}
          copy={copy}
          disabled={disabled}
          onUpload={onUpload}
        />
        <button
          className={styles.ghostBtn}
          type="button"
          onClick={() => onGenerate(pack.id)}
          disabled={disabled}
        >
          {busy ? <LoaderCircle className={styles.spin} size={14} /> : versions.length ? <RefreshCw size={14} /> : <Sparkles size={14} />}
          {busy ? copy.generating : versions.length ? copy.regenerate : copy.generate}
        </button>
      </div>

      {packError ? (
        <div className={styles.packErrorBox} role="alert">
          <span>{copy.packError}</span>
          <span>{packError}</span>
        </div>
      ) : null}

      {primary ? (
        <PackPrimary
          pack={pack}
          packLabel={packLabel}
          actorName={actorName}
          copy={copy}
          version={primary}
          error={versionErrors[primary.versionId] || ""}
          onSetPrimary={onSetPrimary}
        />
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

      {historyOpen && historyVersions.length ? (
        <div className={styles.historyGrid}>
          {historyVersions.map((version) => (
            <PackHistoryItem
              key={version.versionId}
              pack={pack}
              packLabel={packLabel}
              actorName={actorName}
              copy={copy}
              version={version}
              error={versionErrors[version.versionId] || ""}
              onSetPrimary={onSetPrimary}
            />
          ))}
        </div>
      ) : historyOpen && !historyVersions.length ? (
        <p className={styles.historyEmpty}>{copy.versionHistoryEmpty}</p>
      ) : null}
    </section>
  );
}

/**
 * 上传按钮：隐藏 file input，点击触发选择文件。
 * 接受 image/png, image/jpeg, image/webp。
 */
function UploadButton({
  pack,
  copy,
  disabled,
  onUpload,
}: {
  pack: ViewPackId;
  copy: ActorLibraryCopy;
  disabled: boolean;
  onUpload: (pack: ViewPackId, file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onUpload(pack, file);
    } finally {
      setUploading(false);
      // 重置 input 允许重复选择同一文件
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />
      <button
        className={styles.ghostBtn}
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || uploading}
        title={copy.uploadHint}
      >
        {uploading ? <LoaderCircle className={styles.spin} size={14} /> : <Upload size={14} />}
        {uploading ? copy.uploading : copy.upload}
      </button>
    </>
  );
}

function PackPrimary({
  pack,
  packLabel,
  actorName,
  copy,
  version,
  error,
  onSetPrimary,
}: {
  pack: (typeof ACTOR_VIEW_PACKS)[number];
  packLabel: string;
  actorName: string;
  copy: ActorLibraryCopy;
  version: ViewVersion;
  error: string;
  onSetPrimary: (pack: ViewPackId, versionId: string) => void;
}) {
  return (
    <div className={styles.packPrimary}>
      <figure className={`${styles.packItem} ${styles.packItemWide}`} style={{ margin: 0 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={version.previewUrl} alt={`${actorName} · ${packLabel}`} loading="lazy" />
        <span className={styles.primaryBadge}>
          <Star size={11} /> {copy.versionPrimary}
        </span>
        <a href={version.previewUrl} target="_blank" rel="noreferrer" aria-label={copy.viewOpen}>
          <span className={styles.zoomHint}>
            <Expand size={11} />
            {copy.viewOpen}
          </span>
        </a>
      </figure>
      {version.isPrimary ? null : (
        <button className={styles.ghostBtn} type="button" onClick={() => onSetPrimary(pack.id, version.versionId)}>
          {copy.versionSetPrimary}
        </button>
      )}
      {error ? (
        <div className={styles.versionErrorBox} role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}

function PackHistoryItem({
  pack,
  packLabel,
  actorName,
  copy,
  version,
  error,
  onSetPrimary,
}: {
  pack: (typeof ACTOR_VIEW_PACKS)[number];
  packLabel: string;
  actorName: string;
  copy: ActorLibraryCopy;
  version: ViewVersion;
  error: string;
  onSetPrimary: (pack: ViewPackId, versionId: string) => void;
}) {
  return (
    <figure className={styles.historyItem} style={{ margin: 0 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={version.previewUrl} alt={`${actorName} · ${packLabel} · ${version.versionId}`} loading="lazy" />
      <figcaption>
        <span className={styles.historyMeta}>
          {version.createdAt ? new Date(version.createdAt).toLocaleString() : version.versionId}
        </span>
        <span className={styles.historyActions}>
          <a href={version.previewUrl} target="_blank" rel="noreferrer" aria-label={copy.viewOpen}>
            <Expand size={12} /> {copy.viewOpen}
          </a>
          <button
            className={styles.ghostBtn}
            type="button"
            onClick={() => onSetPrimary(pack.id, version.versionId)}
            disabled={version.isPrimary}
          >
            <Star size={12} /> {copy.versionSetPrimary}
          </button>
        </span>
      </figcaption>
      {error ? <div className={styles.versionErrorBox} role="alert">{error}</div> : null}
    </figure>
  );
}
