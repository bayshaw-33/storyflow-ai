"use client";

import { useEffect, useState } from "react";
import { Save, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { Profile, ProfileVisibility, SocialLinks } from "@/components/profile/types";
import { AvatarUploader } from "./AvatarUploader";
import { UsernameField } from "./UsernameField";
import { TagInput } from "./TagInput";
import { SocialLinksEditor } from "./SocialLinksEditor";
import styles from "./settings.module.css";

type ProfileEditorProps = {
  profile: Profile;
  onSaved: () => void;
};

type Notice = { tone: "success" | "error"; text: string };

const EMPTY_SOCIAL: SocialLinks = { overseas: {}, china: {}, display_region: "overseas" };

export function ProfileEditor({ profile, onSaved }: ProfileEditorProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [avatarUrl, setAvatarUrl] = useState<string>(profile.avatar_url ?? "");
  const [username, setUsername] = useState<string>(profile.username ?? "");
  const [displayName, setDisplayName] = useState<string>(profile.display_name ?? "");
  const [bio, setBio] = useState<string>(profile.bio ?? "");
  const [creativeTags, setCreativeTags] = useState<string[]>(profile.creative_tags ?? []);
  const [location, setLocation] = useState<string>(profile.location ?? "");
  const [language, setLanguage] = useState<string>(profile.language_preference || "en-US");
  const [pronouns, setPronouns] = useState<string>(profile.pronouns ?? "");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>(profile.social_links ?? EMPTY_SOCIAL);
  const [visibility, setVisibility] = useState<ProfileVisibility>(profile.profile_visibility ?? "public");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // profile 引用变化时（外部刷新）重置表单
  useEffect(() => {
    setAvatarUrl(profile.avatar_url ?? "");
    setUsername(profile.username ?? "");
    setDisplayName(profile.display_name ?? "");
    setBio(profile.bio ?? "");
    setCreativeTags(profile.creative_tags ?? []);
    setLocation(profile.location ?? "");
    setLanguage(profile.language_preference || "en-US");
    setPronouns(profile.pronouns ?? "");
    setSocialLinks(profile.social_links ?? EMPTY_SOCIAL);
    setVisibility(profile.profile_visibility ?? "public");
  }, [profile]);

  // notice 5s 自动消失
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  const displayTrimmed = displayName.trim();
  const usernameChanged = (profile.username ?? "") !== username.trim();

  async function save() {
    if (saving) return;
    // 前端基础校验
    if (!displayTrimmed) {
      setNotice({ tone: "error", text: isZh ? "请填写显示名称" : "Display name is required" });
      return;
    }
    if (displayTrimmed.length > 32) {
      setNotice({ tone: "error", text: isZh ? "显示名称最多 32 字符" : "Display name up to 32 chars" });
      return;
    }
    if (bio.length > 500) {
      setNotice({ tone: "error", text: isZh ? "简介最多 500 字符" : "Bio up to 500 chars" });
      return;
    }
    setSaving(true);
    setNotice(null);
    try {
      const response = await fetch("/api/profile/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          username: usernameChanged ? username.trim().toLowerCase() || null : undefined,
          display_name: displayTrimmed,
          bio: bio.trim() || null,
          creative_tags: creativeTags,
          location: location.trim() || null,
          language_preference: language,
          pronouns: pronouns.trim() || null,
          social_links: socialLinks,
          profile_visibility: visibility,
          avatar_url: avatarUrl || null,
        }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error || "save failed");
      }
      setNotice({ tone: "success", text: isZh ? "资料已保存。" : "Profile saved." });
      onSaved();
    } catch (error) {
      const message = error instanceof Error ? error.message : "save failed";
      setNotice({ tone: "error", text: isZh ? `保存失败：${message}` : `Save failed: ${message}` });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {notice ? (
        <div className={`${styles.notice} ${notice.tone === "success" ? styles.noticeSuccess : styles.noticeError}`}>
          {notice.tone === "success" ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
          {notice.text}
        </div>
      ) : null}

      <AvatarUploader
        currentAvatarUrl={avatarUrl}
        displayName={displayTrimmed || profile.username || "U"}
        userId={profile.user_id}
        onUploaded={(url) => setAvatarUrl(url)}
      />

      <UsernameField
        value={username}
        onChange={setUsername}
        currentUsername={profile.username}
      />

      <div className={styles.field}>
        <label className={styles.label}>
          {isZh ? "显示名称" : "Display name"}
          <span className={styles.labelHint}>{isZh ? "1-32 字符" : "1-32 chars"}</span>
        </label>
        <input
          type="text"
          className={styles.input}
          value={displayName}
          maxLength={32}
          onChange={(event) => setDisplayName(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          {isZh ? "简介" : "Bio"}
          <span className={styles.labelHint}>{isZh ? `0-500 字符 · ${bio.length}/500` : `0-500 chars · ${bio.length}/500`}</span>
        </label>
        <textarea
          className={styles.textarea}
          value={bio}
          maxLength={500}
          onChange={(event) => setBio(event.target.value)}
        />
      </div>

      <div className={styles.field}>
        <label className={styles.label}>
          {isZh ? "创作领域" : "Creative tags"}
          <span className={styles.labelHint}>{isZh ? "最多 5 个，每个 2-8 字符" : "Up to 5, each 2-8 chars"}</span>
        </label>
        <TagInput tags={creativeTags} onChange={setCreativeTags} maxTags={5} />
      </div>

      <div className={styles.row2}>
        <div className={styles.field}>
          <label className={styles.label}>{isZh ? "所在地" : "Location"}</label>
          <input
            type="text"
            className={styles.input}
            value={location}
            maxLength={64}
            placeholder={isZh ? "城市 / 地区" : "City / region"}
            onChange={(event) => setLocation(event.target.value)}
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{isZh ? "代词" : "Pronouns"}</label>
          <input
            type="text"
            className={styles.input}
            value={pronouns}
            maxLength={32}
            placeholder={isZh ? "她 / 他 / 他们" : "she / he / they"}
            onChange={(event) => setPronouns(event.target.value)}
          />
        </div>
      </div>

      <div className={styles.row2}>
        <div className={styles.field}>
          <label className={styles.label}>{isZh ? "界面语言" : "Language"}</label>
          <select
            className={styles.select}
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            <option value="en-US">English</option>
            <option value="zh-CN">中文</option>
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>{isZh ? "主页可见性" : "Profile visibility"}</label>
          <select
            className={styles.select}
            value={visibility}
            onChange={(event) => setVisibility(event.target.value as ProfileVisibility)}
          >
            <option value="public">{isZh ? "公开" : "Public"}</option>
            <option value="private">{isZh ? "私密" : "Private"}</option>
          </select>
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.label}>{isZh ? "社交链接" : "Social links"}</label>
        <SocialLinksEditor value={socialLinks} onChange={setSocialLinks} />
      </div>

      <div className={styles.rowEnd}>
        <button type="submit" className={styles.primaryButton} disabled={saving}>
          {saving ? <Loader2 size={14} className="spin" /> : <Save size={14} />}
          {saving ? (isZh ? "保存中…" : "Saving…") : (isZh ? "保存" : "Save")}
        </button>
      </div>
    </form>
  );
}
