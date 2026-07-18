"use client";

import { useState, type ChangeEvent, type FormEvent } from "react";
import { ImagePlus, LoaderCircle, X } from "lucide-react";
import type { ActorProfile } from "@/lib/actors";
import { actorApiFetch } from "./actor-client";
import type { ActorLibraryCopy } from "./actor-copy";
import { normalizeTagList } from "./actor-view-model";
import styles from "./actors.module.css";

type Props = {
  open: boolean;
  token: string;
  copy: ActorLibraryCopy;
  onClose: () => void;
  onCreated: (actor: ActorProfile) => void;
};

// 创建入口：文字创建 / 上传头像两种路径，成功后立刻回调让列表可见。
export function CreateActorModal({ open, token, copy, onClose, onCreated }: Props) {
  const [tab, setTab] = useState<"text" | "upload">("text");
  const [name, setName] = useState("");
  const [ageRange, setAgeRange] = useState("");
  const [gender, setGender] = useState("");
  const [ethnicity, setEthnicity] = useState("");
  const [temperament, setTemperament] = useState("");
  const [roles, setRoles] = useState("");
  const [bio, setBio] = useState("");
  const [avatarDataUrl, setAvatarDataUrl] = useState("");
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
    setAvatarDataUrl("");
    setError("");
    setTab("text");
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  async function handleUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(copy.uploadImageOnly);
      return;
    }
    if (file.size > 1.5 * 1024 * 1024) {
      setError(copy.uploadLimit);
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      setAvatarDataUrl(dataUrl);
      setError("");
      if (!name.trim()) {
        setName(file.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 40));
      }
    } catch {
      setError(copy.createFailed);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(copy.createNameRequired);
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
          uploaded_avatar_data_url: avatarDataUrl || undefined,
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

  return (
    <div className={styles.modalBackdrop} role="dialog" aria-modal="true" aria-label={copy.createTitle} onClick={handleClose}>
      <div className={styles.modal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2>{copy.createTitle}</h2>
          <button className={styles.iconBtn} type="button" onClick={handleClose} aria-label={copy.cancel}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.tabRow} role="tablist">
          <button type="button" role="tab" aria-selected={tab === "text"} className={tab === "text" ? styles.active : ""} onClick={() => setTab("text")}>
            {copy.createTabText}
          </button>
          <button type="button" role="tab" aria-selected={tab === "upload"} className={tab === "upload" ? styles.active : ""} onClick={() => setTab("upload")}>
            {copy.createTabUpload}
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className={styles.formGrid}>
            {tab === "upload" ? (
              <label className={styles.uploadBox}>
                {avatarDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className={styles.uploadPreview} src={avatarDataUrl} alt="" />
                ) : (
                  <ImagePlus size={22} />
                )}
                <span>{avatarDataUrl ? copy.createAvatarSelected : copy.createAvatarPick}</span>
                <span>{copy.createAvatarHint}</span>
                <input type="file" accept="image/*" onChange={handleUpload} />
              </label>
            ) : null}

            <label className={`${styles.field} ${styles.fieldWide}`}>
              {copy.createName}
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder={copy.createNamePlaceholder} autoFocus />
            </label>

            {tab === "text" ? (
              <>
                <label className={styles.field}>
                  {copy.createAge}
                  <input value={ageRange} onChange={(event) => setAgeRange(event.target.value)} placeholder={copy.createAgePlaceholder} />
                </label>
                <label className={styles.field}>
                  {copy.createGender}
                  <input value={gender} onChange={(event) => setGender(event.target.value)} placeholder={copy.createGenderPlaceholder} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createEthnicity}
                  <input value={ethnicity} onChange={(event) => setEthnicity(event.target.value)} placeholder={copy.createEthnicityPlaceholder} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createTemperament}
                  <input value={temperament} onChange={(event) => setTemperament(event.target.value)} placeholder={copy.createTemperamentPlaceholder} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createRoles}
                  <input value={roles} onChange={(event) => setRoles(event.target.value)} placeholder={copy.createRolesPlaceholder} />
                </label>
                <label className={`${styles.field} ${styles.fieldWide}`}>
                  {copy.createBio}
                  <textarea value={bio} onChange={(event) => setBio(event.target.value)} placeholder={copy.createBioPlaceholder} />
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

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("IMAGE_READ_FAILED"));
    reader.readAsDataURL(file);
  });
}
