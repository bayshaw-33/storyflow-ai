"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import type { ActorProfile } from "@/lib/actors";
import { actorApiFetch } from "./actor-client";
import type { ActorLibraryCopy } from "./actor-copy";
import { normalizeTagList } from "./actor-view-model";
import { processAvatarImage, uploadProcessedAvatar } from "@/lib/avatar-processing";
import styles from "./actors.module.css";

type Props = {
  open: boolean;
  token: string;
  copy: ActorLibraryCopy;
  onClose: () => void;
  onCreated: (actor: ActorProfile) => void;
};

type AvatarPhase = "idle" | "processing" | "uploading" | "ready";

// 创建入口：文字创建 / 上传头像两种路径，成功后立刻回调让列表可见。
// 头像上传流程（废弃 Base64）：
//   选择图片 → processAvatarImage（自动旋转 + 压缩 + 去 EXIF）
//   → uploadProcessedAvatar（POST /api/actors/upload-avatar）
//   → 保存 assetId → 表单提交时传 avatar_asset_id
// 数据库不再保存 data:image/... Base64 字符串。
export function CreateActorModal({ open, token, copy, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<"text" | "upload">("text");
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [gender, setGender] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [temperament, setTemperament] = useState("");
  const [roles, setRoles] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState("");
  const [avatarPhase, setAvatarPhase] = useState<AvatarPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (!open) return null;

  function reset() {
    setName("");
    setAgeRange("");
    setGender("");
    setEthnicity("");
    setTemperament("");
    setRoles("");
    setBio("");
    setAvatarPreviewUrl("");
    setAvatarAssetId("");
    setAvatarPhase("idle");
    setError("");
    setTab("text");
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  function mapAvatarError(message: string): string {
    if (message === "AVATAR_TYPE_UNSUPPORTED") return copy.avatarErrorType;
    if (message === "AVATAR_RAW_SIZE_EXCEEDS_20MB") return copy.avatarErrorSize;
    if (message === "AVATAR_BITMAP_DECODE_FAILED" || message === "AVATAR_CANVAS_CONTEXT_FAILED" || message === "AVATAR_CANVAS_TO_BLOB_FAILED") return copy.avatarErrorDecode;
    if (message.startsWith("AVATAR_UPLOAD")) return copy.avatarErrorUpload;
    return copy.createFailed;
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(copy.uploadImageOnly);
      return;
    }

    setBusy(true);
    setError("");
    setAvatarPhase("processing");
    setAvatarPreviewUrl("");
    setAvatarAssetId("");

    try {
      // 客户端处理：自动旋转 + 压缩 + 去 EXIF（最长边 ≤ 2048px、目标 ≤ 6MB）
      const processed = await processAvatarImage(file);

      // 上传到服务端 Storage（FormData POST /api/actors/upload-avatar）
      setAvatarPhase("uploading");
      const uploaded = await uploadProcessedAvatar(processed.blob, token);

      setAvatarPreviewUrl(uploaded.previewUrl);
      setAvatarAssetId(uploaded.assetId);
      setAvatarPhase("ready");

      // 没有名称时用文件名预填
      if (!name.trim()) {
        setName(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40));
      }
    } catch (issue) {
      setError(mapAvatarError(issue instanceof Error ? issue.message : ""));
      setAvatarPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(copy.createNameRequired);
      return;
    }
    if (avatarPhase === "processing" || avatarPhase === "uploading") {
      setError(copy.avatarInProgress);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await actorApiFetch<{ actor: ActorProfile }>("/api/actors", token, {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          age_range: ageRange.trim(),
          gender_expression: gender.trim(),
          ethnicity_style: ethnicity.trim(),
          temperament: normalizeTagList(temperament),
          playable_roles: normalizeTagList(roles),
          bio: bio.trim(),
          avatar_asset_id: avatarAssetId || undefined,
        }),
      });
      reset();
      onCreated(result.actor);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : copy.createFailed);
    } finally {
      setBusy(false);
    }
  }

  const avatarLabel =
    avatarPhase === "processing" ? copy.avatarProcessing
      : avatarPhase === "uploading" ? copy.avatarUploading
        : avatarPhase === "ready" ? copy.createAvatarSelected
          : copy.createAvatarPick;

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={copy.createTitle} onClick={handleClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{copy.createTitle}</h2>
          <button className={styles.iconBtn} type="button" onClick={handleClose} aria-label={copy.cancel} disabled={busy}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.tabRow} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "text"} className={tab === "text" ? styles.active : ""} onClick={() => setTab("text")} disabled={busy}>
            {copy.createTabText}
          </button>
          <button type="button" role="tab" aria-selected={tab === "upload"} className={tab === "upload" ? styles.active : ""} onClick={() => setTab("upload")} disabled={busy}>
            {copy.createTabUpload}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            {tab === "upload" ? (
              <label className={styles.uploadBox}>
                {avatarPreviewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.uploadPreview} src={avatarPreviewUrl} alt="" />
                ) : avatarPhase === "processing" || avatarPhase === "uploading" ? (
                  <LoaderCircle className={styles.spin} size={22} />
                ) : (
                  <ImagePlus size={22} />
                )}
                <span>{avatarLabel}</span>
                <span>{copy.createAvatarHint}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleUpload} disabled={busy} />
              </label>
            ) : null}

            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.createName}
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.createNamePlaceholder} autoFocus disabled={busy} />
            </label>

            {tab === "text" ? (
              <>
                <label className={styles.field}>
                  {copy.createAge}
                  <input value={ageRange} onChange={(event) => setAgeRange(event.target.value)} placeholder={copy.createAgePlaceholder} disabled={busy} />
                </label>
                <label className={styles.field}>
                  {copy.createGender}
                  <input value={gender} onChange={(event) => setGender(event.target.value)} placeholder={copy.createGenderPlaceholder} disabled={busy} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createEthnicity}
                  <input value={ethnicity} onChange={(event) => setEthnicity(event.target.value)} placeholder={copy.createEthnicityPlaceholder} disabled={busy} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createTemperament}
                  <input value={temperament} onChange={(event) => setTemperament(event.target.value)} placeholder={copy.createTemperamentPlaceholder} disabled={busy} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createRoles}
                  <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder={copy.createRolesPlaceholder} disabled={busy} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createBio}
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder={copy.createBioPlaceholder} disabled={busy} />
                </label>
              </>
            ) : null}
          </div>

          {error ? <div className={styles.modalError}>{error}</div> : null}

          <div className={styles.modalFoot}>
            <button className={styles.ghostBtn} type="button" onClick={handleClose} disabled={busy}>
              {copy.cancel}
            </button>
            <button className={styles.primaryBtn} type="submit" disabled={busy}>
              {busy ? <LoaderCircle className={styles.spin} size={15} /> : null}
              {busy ? copy.creating : copy.createSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
