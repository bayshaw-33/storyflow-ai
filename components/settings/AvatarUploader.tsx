"use client";

import { useRef, useState } from "react";
import { Upload, Sparkles, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { LetterAvatar } from "@/components/profile/LetterAvatar";
import { AvatarAIGenerator } from "./AvatarAIGenerator";
import styles from "./settings.module.css";

type AvatarUploaderProps = {
  currentAvatarUrl?: string | null;
  displayName: string;
  userId: string;
  onUploaded: (url: string) => void;
};

/**
 * 头像上传组件：当前头像（或字母头像 fallback）+ 上传图片 + AI 生成。
 * 上传：file input → POST /api/profile/avatar/upload（FormData）。
 * AI 生成：先调 /api/profile/avatar/whitelist-status 检查权限，有权限则展开生成面板。
 */
export function AvatarUploader({ currentAvatarUrl, displayName, userId, onUploaded }: AvatarUploaderProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [whitelistChecked, setWhitelistChecked] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);
  const [checkingWhitelist, setCheckingWhitelist] = useState(false);

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(isZh ? "请上传图片文件" : "Please upload an image file");
      return;
    }
    setUploading(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/profile/avatar/upload", {
        method: "POST",
        body: formData,
        credentials: "same-origin",
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || "upload failed");
      }
      onUploaded(payload.url);
    } catch {
      setError(isZh ? "上传失败，请重试" : "Upload failed, please retry");
    } finally {
      setUploading(false);
    }
  }

  async function openAi() {
    if (aiOpen) {
      setAiOpen(false);
      return;
    }
    if (!whitelistChecked) {
      setCheckingWhitelist(true);
      setError("");
      try {
        const response = await fetch("/api/profile/avatar/whitelist-status", { credentials: "same-origin" });
        const payload = (await response.json().catch(() => null)) as { whitelisted?: boolean } | null;
        setWhitelisted(Boolean(response.ok && payload?.whitelisted));
        setWhitelistChecked(true);
      } catch {
        setWhitelisted(false);
        setWhitelistChecked(true);
      } finally {
        setCheckingWhitelist(false);
      }
    }
    setAiOpen(true);
  }

  return (
    <div className={styles.field}>
      <label className={styles.label}>{isZh ? "头像" : "Avatar"}</label>
      <div className={styles.avatarUploader}>
        <div className={styles.avatarPreview}>
          {currentAvatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentAvatarUrl} alt={displayName} />
          ) : (
            <LetterAvatar displayName={displayName} userId={userId} size={80} />
          )}
        </div>
        <div className={styles.avatarActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? <Loader2 size={14} className="spin" /> : <Upload size={14} />}
            {uploading ? (isZh ? "上传中…" : "Uploading…") : (isZh ? "上传图片" : "Upload image")}
          </button>
          <button
            type="button"
            className={styles.secondaryButton}
            disabled={checkingWhitelist}
            onClick={openAi}
          >
            <Sparkles size={14} />
            {isZh ? "AI 生成" : "AI generate"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className={styles.fileInput}
            onChange={handleFile}
          />
        </div>
      </div>
      {error ? <span className={styles.errorText}>{error}</span> : null}

      {aiOpen && !whitelisted ? (
        <span className={styles.hint}>
          {isZh ? "AI 生成当前仅对管理员或白名单用户开放。" : "AI generation is currently limited to admins or whitelisted users."}
        </span>
      ) : null}

      {aiOpen && whitelisted ? (
        <AvatarAIGenerator onGenerated={(url) => { onUploaded(url); setAiOpen(false); }} />
      ) : null}
    </div>
  );
}
