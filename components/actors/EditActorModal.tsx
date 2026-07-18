"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import type { ActorProfile, ActorVisibility } from "@/lib/actors";
import { actorApiFetch } from "./actor-client";
import type { ActorLibraryCopy } from "./actor-copy";
import { normalizeTagList } from "./actor-view-model";
import { processAvatarImage, uploadProcessedAvatar } from "@/lib/avatar-processing";
import styles from "./actors.module.css";

type Props = {
  open: boolean;
  token: string;
  copy: ActorLibraryCopy;
  actor: ActorProfile | null;
  onClose: () => void;
  onUpdated: (actor: ActorProfile) => void;
};

type AvatarPhase = "idle" | "processing" | "uploading" | "ready";

// 编辑演员资料模态框：
// - 仅创建者可打开（详情页按 owner_id === session.user.id 判断）
// - 所有可编辑字段预填当前值
// - 空字段不覆盖已有内容（服务端 mergeActorUpdate 负责）
// - metadata 深合并（服务端 mergeActorMetadata 负责）
// - 头像可更换：客户端压缩 + Storage 上传，与 CreateActorModal 同流程
// - 共享范围：private / team（platform 在 Commit 4 加）
// - 保存成功立即回调 onUpdated 刷新卡片和详情页
// - 保存失败保留用户尚未提交的内容（不 reset）
export function EditActorModal({ open, token, copy, actor, onClose, onUpdated }: Props) {
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [gender, setGender] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [faceDesc, setFaceDesc] = useState("");
  const [hairDesc, setHairDesc] = useState("");
  const [bodyDesc, setBodyDesc] = useState("");
  const [temperament, setTemperament] = useState("");
  const [roles, setRoles] = useState("");
  const [bio, setBio] = useState("");
  const [basePrompt, setBasePrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [visibility, setVisibility] = useState<ActorVisibility>("private");
  const [teamId, setTeamId] = useState<string>("");
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState("");
  const [avatarAssetId, setAvatarAssetId] = useState("");
  const [avatarPhase, setAvatarPhase] = useState<AvatarPhase>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [initialized, setInitialized] = useState(false);

  // 每次 actor 变化（打开模态框）时预填字段
  if (open && actor && !initialized) {
    setName(actor.name || "");
    setAgeRange(actor.age_range || "");
    setGender(actor.gender_expression || "");
    setEthnicity(actor.ethnicity_style || "");
    setFaceDesc(actor.face_description || "");
    setHairDesc(actor.hair_description || "");
    setBodyDesc(actor.body_description || "");
    setTemperament(Array.isArray(actor.temperament) ? actor.temperament.join(", ") : "");
    setRoles(Array.isArray(actor.playable_roles) ? actor.playable_roles.join(", ") : "");
    setBio(actor.bio || "");
    setBasePrompt(actor.base_prompt || "");
    setNegativePrompt(actor.negative_prompt || "");
    setVisibility(actor.visibility === "team" ? "team" : actor.visibility === "platform" ? "platform" : "private");
    setTeamId(actor.team_id || "");
    setAvatarPreviewUrl(actor.avatar_url || "");
    setAvatarAssetId("");
    setAvatarPhase("idle");
    setError("");
    setInitialized(true);
  }

  if (!open) {
    if (initialized) setInitialized(false);
    return null;
  }

  function handleClose() {
    if (busy) return;
    setInitialized(false);
    onClose();
  }

  function mapAvatarError(message: string): string {
    if (message === "AVATAR_TYPE_UNSUPPORTED") return copy.avatarErrorType;
    if (message === "AVATAR_RAW_SIZE_EXCEEDS_20MB") return copy.avatarErrorSize;
    if (message === "AVATAR_BITMAP_DECODE_FAILED" || message === "AVATAR_CANVAS_CONTEXT_FAILED" || message === "AVATAR_CANVAS_TO_BLOB_FAILED") return copy.avatarErrorDecode;
    if (message.startsWith("AVATAR_UPLOAD")) return copy.avatarErrorUpload;
    return copy.editFailed;
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
      const processed = await processAvatarImage(file);
      setAvatarPhase("uploading");
      const uploaded = await uploadProcessedAvatar(processed.blob, token);
      setAvatarPreviewUrl(uploaded.previewUrl);
      setAvatarAssetId(uploaded.assetId);
      setAvatarPhase("ready");
    } catch (issue) {
      setError(mapAvatarError(issue instanceof Error ? issue.message : ""));
      setAvatarPhase("idle");
    } finally {
      setBusy(false);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!actor) return;
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
      // 仅传变更字段；服务端 mergeActorUpdate 负责空字段不覆盖 + metadata 深合并
      const body: Record<string, unknown> = {
        id: actor.id,
        name: name.trim(),
        age_range: ageRange.trim(),
        gender_expression: gender.trim(),
        ethnicity_style: ethnicity.trim(),
        face_description: faceDesc.trim(),
        hair_description: hairDesc.trim(),
        body_description: bodyDesc.trim(),
        temperament: normalizeTagList(temperament),
        playable_roles: normalizeTagList(roles),
        bio: bio.trim(),
        base_prompt: basePrompt.trim(),
        negative_prompt: negativePrompt.trim(),
        visibility,
      };
      if (visibility === "team" && teamId) body.team_id = teamId;
      if (avatarAssetId) body.avatar_asset_id = avatarAssetId;

      const result = await actorApiFetch<{ actor: ActorProfile }>("/api/actors", token, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setInitialized(false);
      onUpdated(result.actor);
    } catch (issue) {
      // 保存失败：保留用户输入（不 reset）
      setError(issue instanceof Error ? issue.message : copy.editFailed);
    } finally {
      setBusy(false);
    }
  }

  const avatarLabel =
    avatarPhase === "processing" ? copy.avatarProcessing
      : avatarPhase === "uploading" ? copy.avatarUploading
        : avatarPhase === "ready" ? copy.createAvatarSelected
          : copy.editAvatarReplace;

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={copy.editTitle} onClick={handleClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{copy.editTitle}</h2>
          <button className={styles.iconBtn} type="button" onClick={handleClose} aria-label={copy.cancel} disabled={busy}>
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
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

            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.createName}
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.createNamePlaceholder} autoFocus disabled={busy} />
            </label>

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
              {copy.fieldFace}
              <input value={faceDesc} onChange={(event) => setFaceDesc(event.target.value)} placeholder={copy.editFacePlaceholder} disabled={busy} />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.fieldHair}
              <input value={hairDesc} onChange={(event) => setHairDesc(event.target.value)} placeholder={copy.editHairPlaceholder} disabled={busy} />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.fieldBody}
              <input value={bodyDesc} onChange={(event) => setBodyDesc(event.target.value)} placeholder={copy.editBodyPlaceholder} disabled={busy} />
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

            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.visibilityLabel}
              <select value={visibility} onChange={(event) => setVisibility(event.target.value as ActorVisibility)} disabled={busy}>
                <option value="private">{copy.visibilityPrivate}</option>
                <option value="team">{copy.visibilityTeam}</option>
                <option value="platform">{copy.visibilityPlatform}</option>
              </select>
            </label>

            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.promptBase}
              <textarea value={basePrompt} onChange={(event) => setBasePrompt(event.target.value)} placeholder={copy.editPromptPlaceholder} disabled={busy} rows={4} />
            </label>
            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.promptNegative}
              <textarea value={negativePrompt} onChange={(event) => setNegativePrompt(event.target.value)} placeholder={copy.editPromptPlaceholder} disabled={busy} rows={3} />
            </label>
          </div>

          {error ? <div className={styles.modalError}>{error}</div> : null}

          <div className={styles.modalFoot}>
            <button className={styles.ghostBtn} type="button" onClick={handleClose} disabled={busy}>
              {copy.cancel}
            </button>
            <button className={styles.primaryBtn} type="submit" disabled={busy}>
              {busy ? <LoaderCircle className={styles.spin} size={15} /> : null}
              {busy ? copy.editing : copy.editSubmit}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
