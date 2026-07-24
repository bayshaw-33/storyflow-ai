"use client";

import { useEffect, useState } from "react";
import {
  X,
  Share2,
  Copy,
  Check,
  RefreshCw,
  Loader2,
  Lock,
  Eye,
} from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import styles from "./universe-share.module.css";

/**
 * share_permissions 结构（与设计文档 §2.2 对齐）。
 * 从本文件导出，供 SharedUniverseView 复用。
 */
export interface SharePermissions {
  sections: {
    overview: boolean;
    characters: boolean;
    scenes: boolean;
    rules: boolean;
    actors: boolean;
    chapters: boolean;
    timeline: boolean;
  };
  allow_edit: boolean;
  edit_permissions: {
    characters: boolean;
    scenes: boolean;
    rules: boolean;
    actors: boolean;
    chapters: boolean;
  };
}

export interface ShareConfigDialogProps {
  open: boolean;
  universeId: string;
  initialConfig: {
    share_status: "private" | "shared";
    share_permissions: SharePermissions;
    has_password: boolean;
  };
  onClose: () => void;
  onSaved: () => void;
}

const DEFAULT_PERMISSIONS: SharePermissions = {
  sections: {
    overview: true,
    characters: true,
    scenes: true,
    rules: false,
    actors: true,
    chapters: false,
    timeline: false,
  },
  allow_edit: false,
  edit_permissions: {
    characters: false,
    scenes: false,
    rules: false,
    actors: false,
    chapters: false,
  },
};

const SECTION_KEYS = [
  "overview",
  "characters",
  "scenes",
  "rules",
  "actors",
  "chapters",
  "timeline",
] as const;

type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_LABELS: Record<SectionKey, { zh: string; en: string }> = {
  overview: { zh: "宇宙简介", en: "Overview" },
  characters: { zh: "角色", en: "Characters" },
  scenes: { zh: "场景", en: "Scenes" },
  rules: { zh: "世界规则", en: "Rules" },
  actors: { zh: "演员", en: "Actors" },
  chapters: { zh: "章节", en: "Chapters" },
  timeline: { zh: "时间线", en: "Timeline" },
};

/** 生成 10 位易读随机密码（去掉易混字符）。 */
function generatePassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const buffer = new Uint32Array(10);
  crypto.getRandomValues(buffer);
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += chars[buffer[i] % chars.length];
  }
  return out;
}

/**
 * 创作者分享配置 Modal。
 * 暗色玻璃风格，参考 PurchaseDialog 的 Modal 视觉与 ProfileEditor 的表单结构。
 */
export function ShareConfigDialog({
  open,
  universeId,
  initialConfig,
  onClose,
  onSaved,
}: ShareConfigDialogProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [shareStatus, setShareStatus] = useState<"private" | "shared">("private");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<SharePermissions>(DEFAULT_PERMISSIONS);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  // 打开时从 initialConfig 同步
  useEffect(() => {
    if (!open) return;
    setShareStatus(initialConfig.share_status);
    setPermissions(initialConfig.share_permissions ?? DEFAULT_PERMISSIONS);
    setPassword("");
    setError("");
    setToast(null);
    setCopied(false);
  }, [open, initialConfig]);

  // ESC 关闭 + body 滚动锁
  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", handleKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKey);
      document.body.style.overflow = prev;
    };
  }, [open, saving, onClose]);

  // toast 自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!open) return null;

  const isShared = shareStatus === "shared";

  function toggleSection(key: SectionKey) {
    setPermissions((prev) => ({
      ...prev,
      sections: { ...prev.sections, [key]: !prev.sections[key] },
    }));
  }

  async function copyLink() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const link = `${origin}/universes/${universeId}?share=1`;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setToast(isZh ? "已复制" : "Copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(isZh ? "复制失败" : "Copy failed");
    }
  }

  async function save() {
    if (saving) return;
    setError("");
    if (isShared && password) {
      if (password.length < 6 || password.length > 32) {
        setError(isZh ? "密码需 6-32 字符" : "Password must be 6-32 chars");
        return;
      }
    }
    setSaving(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setError(isZh ? "登录态异常，请刷新重试" : "Session unavailable, please refresh");
        return;
      }
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token ?? "";
      const res = await fetch(`/api/universes/${universeId}/share`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          share_status: shareStatus,
          password: password || null,
          permissions,
        }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "save failed");
      }
      setToast(isZh ? "已保存" : "Saved");
      // 让用户看到 toast 后再让父组件关闭/刷新
      setTimeout(() => onSaved(), 900);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      setError(isZh ? `保存失败：${msg}` : `Save failed: ${msg}`);
    } finally {
      setSaving(false);
    }
  }

  const passwordPlaceholder = initialConfig.has_password
    ? isZh
      ? "已设置（留空不修改）"
      : "Set (leave blank to keep)"
    : isZh
      ? "为访客设置访问密码"
      : "Set an access password for visitors";

  return (
    <div
      className={styles.configBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-config-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div className={styles.configDialog}>
        <div className={styles.configHead}>
          <h2 id="share-config-title" className={styles.configTitle}>
            <Share2 size={15} />
            {isZh ? "分享设置" : "Share settings"}
          </h2>
          <button
            type="button"
            className={styles.configClose}
            onClick={onClose}
            disabled={saving}
            aria-label={isZh ? "关闭" : "Close"}
          >
            <X size={16} />
          </button>
        </div>

        {toast ? (
          <div className={styles.toast}>
            <Check size={12} />
            {toast}
          </div>
        ) : null}

        {/* 分享状态 */}
        <div className={styles.field}>
          <label className={styles.label}>{isZh ? "分享状态" : "Share status"}</label>
          <div className={styles.radioRow}>
            <label
              className={`${styles.radioChip} ${!isShared ? styles.radioChipActive : ""}`}
            >
              <input
                type="radio"
                name="share-status"
                checked={!isShared}
                onChange={() => setShareStatus("private")}
              />
              {isZh ? "未分享" : "Private"}
            </label>
            <label
              className={`${styles.radioChip} ${isShared ? styles.radioChipActive : ""}`}
            >
              <input
                type="radio"
                name="share-status"
                checked={isShared}
                onChange={() => setShareStatus("shared")}
              />
              {isZh ? "已分享" : "Shared"}
            </label>
          </div>
        </div>

        {/* 访问密码 */}
        <div className={`${styles.field} ${!isShared ? styles.disabledBlock : ""}`}>
          <label className={styles.label}>
            <Lock size={12} />
            {isZh ? "访问密码" : "Access password"}
            <span className={styles.labelHint}>{isZh ? "6-32 字符" : "6-32 chars"}</span>
          </label>
          <div className={styles.inputRow}>
            <input
              type="password"
              className={styles.input}
              value={password}
              placeholder={passwordPlaceholder}
              maxLength={32}
              onChange={(event) => setPassword(event.target.value)}
              disabled={!isShared}
            />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnGhost} ${styles.btnSmall}`}
              onClick={() => setPassword(generatePassword())}
              disabled={!isShared}
            >
              <RefreshCw size={12} />
              {isZh ? "生成" : "Generate"}
            </button>
          </div>
        </div>

        {/* 可见内容勾选 */}
        <div className={`${styles.field} ${!isShared ? styles.disabledBlock : ""}`}>
          <label className={styles.label}>
            <Eye size={12} />
            {isZh ? "可见内容" : "Visible content"}
          </label>
          <div className={styles.checkGrid}>
            {SECTION_KEYS.map((key) => {
              const checked = permissions.sections[key];
              return (
                <label
                  key={key}
                  className={`${styles.checkItem} ${checked ? styles.checkItemChecked : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSection(key)}
                    disabled={!isShared}
                  />
                  {isZh ? SECTION_LABELS[key].zh : SECTION_LABELS[key].en}
                </label>
              );
            })}
          </div>
        </div>

        <div className={styles.divider} />

        {/* 编辑权限（灰色禁用，即将开放） */}
        <div className={styles.field}>
          <label className={styles.label}>
            {isZh ? "编辑权限" : "Edit permissions"}
            <span className={styles.comingSoon}>{isZh ? "即将开放" : "Coming soon"}</span>
          </label>
          <div className={styles.disabledBlock}>
            <label className={`${styles.checkItem} ${styles.checkItemChecked}`}>
              <input type="checkbox" disabled />
              {isZh ? "允许访客编辑可见内容" : "Allow visitors to edit visible content"}
            </label>
          </div>
        </div>

        {/* 分享链接（仅 shared 时显示） */}
        {isShared ? (
          <div className={styles.field}>
            <label className={styles.label}>{isZh ? "分享链接" : "Share link"}</label>
            <div className={styles.linkRow}>
              <span className={styles.linkInput}>
                {`${typeof window !== "undefined" ? window.location.origin : ""}/universes/${universeId}?share=1`}
              </span>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSecondary} ${styles.btnSmall}`}
                onClick={copyLink}
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {isZh ? "复制链接" : "Copy"}
              </button>
            </div>
          </div>
        ) : null}

        {error ? <div className={styles.inlineError}>{error}</div> : null}

        <div className={styles.configFoot}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSecondary}`}
            onClick={onClose}
            disabled={saving}
          >
            {isZh ? "取消" : "Cancel"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={save}
            disabled={saving}
          >
            {saving ? <Loader2 size={14} className="spin" /> : null}
            {saving ? (isZh ? "保存中…" : "Saving…") : isZh ? "保存" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
