"use client";

/**
 * KIIKIS 2.1 Phase 3 — Task 3.6 KK 外观与隐私 (K21-KK-020/022)
 *
 * 职责：
 *   1. 展示当前装备的 item (itemId + version)
 *   2. 展示成长等级 + XP (K21-KK-023)
 *   3. 允许用户切换 profile_display / community_display 隐私开关
 *      - 默认全部关闭 (K21-KK-022 隐私默认关闭)
 *      - 用户主动开启才对外公开
 *   4. 不展示：抽卡概率、付费按钮、市场价格、稀缺投资文案 (K21-KK-024)
 *
 * 数据流：
 *   - 从 useKkRuntime() 读取 profile
 *   - 通过 updateKkProfile() API 写回服务端
 *   - 失败时回滚 UI 状态 (optimistic + rollback)
 */

import { useCallback, useEffect, useState } from "react";
import { Check, Eye, EyeOff, Lock, Sparkles } from "lucide-react";
import type { KkProfile } from "@/lib/contracts/v2/kk-profile";
import { updateKkProfile } from "@/lib/client/v2/kk/api";
import { useI18n } from "@/lib/i18n/useI18n";
import { useKkRuntime } from "./useKkRuntime";
import styles from "./kk.module.css";

// ============================================================
// 国际化文案
// ============================================================

const COPY = {
  "zh-CN": {
    title: "外观与隐私",
    subtitle: "管理你的 KK 形象与公开范围",
    appearanceHeader: "当前外观",
    notEquipped: "未装备",
    equippedLabel: "装备中",
    itemIdLabel: "物品 ID",
    versionLabel: "版本",
    privacyHeader: "隐私设置",
    profileDisplayTitle: "公开个人主页",
    profileDisplayDesc: "开启后，他人可查看你的展示页（外观、等级、最近作品摘要）。",
    communityDisplayTitle: "在社区展示成长",
    communityDisplayDesc: "开启后，你的等级与里程碑可在社区公开列表展示。",
    privacyDefaultHint: "默认全部关闭，仅在你主动开启时对外可见。",
    growthHeader: "成长",
    growthLevel: "等级",
    growthXp: "经验值",
    saving: "保存中…",
    saveError: "保存失败，已回滚",
    refreshHint: "修改后即时同步到所有设备。",
    noProbability: "本应用不展示抽卡概率与稀缺度投资信息。",
  },
  en: {
    title: "Appearance & Privacy",
    subtitle: "Manage your KK avatar and visibility",
    appearanceHeader: "Current appearance",
    notEquipped: "Not equipped",
    equippedLabel: "Equipped",
    itemIdLabel: "Item ID",
    versionLabel: "Version",
    privacyHeader: "Privacy",
    profileDisplayTitle: "Public profile",
    profileDisplayDesc: "When enabled, others can view your showcase page (appearance, level, recent works summary).",
    communityDisplayTitle: "Show growth in community",
    communityDisplayDesc: "When enabled, your level and milestones can appear in public community lists.",
    privacyDefaultHint: "All off by default — only visible when you explicitly enable.",
    growthHeader: "Growth",
    growthLevel: "Level",
    growthXp: "XP",
    saving: "Saving…",
    saveError: "Save failed, rolled back",
    refreshHint: "Changes sync across all your devices instantly.",
    noProbability: "This app does not show draw probabilities or rarity investment info.",
  },
} as const;

function useCopy() {
  const { locale } = useI18n();
  return COPY[locale === "zh-CN" ? "zh-CN" : "en"];
}

// ============================================================
// 安全类型转换 (runtime 返回的 unknown -> KkProfile)
// ============================================================

function asKkProfile(raw: unknown): KkProfile | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.ownerId !== "string" && typeof r.owner_id !== "string") return null;
  return {
    ownerId: (r.ownerId as string) ?? (r.owner_id as string) ?? "",
    displayName: (r.displayName as string) ?? (r.display_name as string) ?? "",
    equippedItemId: (r.equippedItemId as string | null) ?? (r.equipped_item_id as string | null) ?? null,
    equippedItemVersion: (r.equippedItemVersion as string | null) ?? (r.equipped_item_version as string | null) ?? null,
    profileDisplay: Boolean(r.profileDisplay ?? r.profile_display ?? false),
    communityDisplay: Boolean(r.communityDisplay ?? r.community_display ?? false),
    growthLevel: Number(r.growthLevel ?? r.growth_level ?? 0),
    growthXp: Number(r.growthXp ?? r.growth_xp ?? 0),
    recentProjectId: (r.recentProjectId as string | null) ?? (r.recent_project_id as string | null) ?? null,
    recentUniverseId: (r.recentUniverseId as string | null) ?? (r.recent_universe_id as string | null) ?? null,
    createdAt: (r.createdAt as string) ?? (r.created_at as string) ?? "",
    updatedAt: (r.updatedAt as string) ?? (r.updated_at as string) ?? "",
  };
}

// ============================================================
// 主组件
// ============================================================

export interface KkAppearanceProps {
  /** 访问 token；为 null 时不允许写入 */
  accessToken?: string | null;
  /** 写入失败的回调 (可选) */
  onError?: (message: string) => void;
}

export function KkAppearance({ accessToken = null, onError }: KkAppearanceProps) {
  const runtime = useKkRuntime();
  const c = useCopy();

  const profile = asKkProfile(runtime.profile);
  const [profileDisplay, setProfileDisplay] = useState<boolean>(profile?.profileDisplay ?? false);
  const [communityDisplay, setCommunityDisplay] = useState<boolean>(profile?.communityDisplay ?? false);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // profile 变更时同步本地状态 (K21-KK-020: 服务端是真相)
  useEffect(() => {
    if (profile) {
      setProfileDisplay(profile.profileDisplay);
      setCommunityDisplay(profile.communityDisplay);
    }
  }, [profile?.profileDisplay, profile?.communityDisplay]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = useCallback(
    async (key: "profileDisplay" | "communityDisplay", next: boolean) => {
      if (!accessToken) {
        setError(c.saveError);
        return;
      }
      // 乐观更新
      const prev = key === "profileDisplay" ? profileDisplay : communityDisplay;
      if (key === "profileDisplay") setProfileDisplay(next);
      else setCommunityDisplay(next);
      setSavingKey(key);
      setError(null);
      try {
        await updateKkProfile(accessToken, { [key]: next });
      } catch (err) {
        // 回滚
        if (key === "profileDisplay") setProfileDisplay(prev);
        else setCommunityDisplay(prev);
        const msg = err instanceof Error ? err.message : String(err);
        setError(c.saveError);
        onError?.(msg);
      } finally {
        setSavingKey(null);
      }
    },
    [accessToken, profileDisplay, communityDisplay, c.saveError, onError],
  );

  if (!profile) {
    return (
      <div className={styles.appearanceCard}>
        <p className={styles.appearanceEmpty}>{c.title} — {c.subtitle}</p>
      </div>
    );
  }

  return (
    <section className={styles.appearanceCard} aria-label={c.title}>
      <header className={styles.appearanceHeader}>
        <div>
          <h3 className={styles.appearanceTitle}>{c.title}</h3>
          <p className={styles.appearanceSubtitle}>{c.subtitle}</p>
        </div>
      </header>

      {/* 当前外观 */}
      <div className={styles.appearanceBlock}>
        <h4 className={styles.appearanceBlockTitle}>{c.appearanceHeader}</h4>
        {profile.equippedItemId ? (
          <div className={styles.equippedRow}>
            <div className={styles.equippedIcon} aria-hidden>
              <Sparkles size={18} />
            </div>
            <div className={styles.equippedInfo}>
              <div className={styles.equippedBadge}>{c.equippedLabel}</div>
              <div className={styles.equippedItemId}>
                <span className={styles.equippedKey}>{c.itemIdLabel}:</span>{" "}
                <code>{profile.equippedItemId}</code>
              </div>
              <div className={styles.equippedItemVer}>
                <span className={styles.equippedKey}>{c.versionLabel}:</span>{" "}
                <code>{profile.equippedItemVersion ?? "—"}</code>
              </div>
            </div>
          </div>
        ) : (
          <p className={styles.appearanceEmpty}>{c.notEquipped}</p>
        )}
      </div>

      {/* 成长 */}
      <div className={styles.appearanceBlock}>
        <h4 className={styles.appearanceBlockTitle}>{c.growthHeader}</h4>
        <div className={styles.growthRow}>
          <div className={styles.growthCell}>
            <div className={styles.growthLabel}>{c.growthLevel}</div>
            <div className={styles.growthValue}>{profile.growthLevel}</div>
          </div>
          <div className={styles.growthCell}>
            <div className={styles.growthLabel}>{c.growthXp}</div>
            <div className={styles.growthValue}>{profile.growthXp}</div>
          </div>
        </div>
        {/* K21-KK-024: 不展示抽卡概率、付费按钮、市场价格 */}
        <p className={styles.noProbability}>{c.noProbability}</p>
      </div>

      {/* 隐私 */}
      <div className={styles.appearanceBlock}>
        <h4 className={styles.appearanceBlockTitle}>{c.privacyHeader}</h4>
        <p className={styles.privacyHint}>{c.privacyDefaultHint}</p>

        <label className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleTitle}>
              {profileDisplay ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{c.profileDisplayTitle}</span>
            </div>
            <div className={styles.toggleDesc}>{c.profileDisplayDesc}</div>
          </div>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={profileDisplay}
            onChange={(e) => handleToggle("profileDisplay", e.target.checked)}
            disabled={savingKey === "profileDisplay"}
            aria-label={c.profileDisplayTitle}
          />
        </label>

        <label className={styles.toggleRow}>
          <div className={styles.toggleInfo}>
            <div className={styles.toggleTitle}>
              {communityDisplay ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{c.communityDisplayTitle}</span>
            </div>
            <div className={styles.toggleDesc}>{c.communityDisplayDesc}</div>
          </div>
          <input
            type="checkbox"
            className={styles.toggleInput}
            checked={communityDisplay}
            onChange={(e) => handleToggle("communityDisplay", e.target.checked)}
            disabled={savingKey === "communityDisplay"}
            aria-label={c.communityDisplayTitle}
          />
        </label>

        {savingKey ? <p className={styles.savingHint}>{c.saving}</p> : null}
        {error ? <p className={styles.appearanceError}>{error}</p> : null}
      </div>

      <footer className={styles.appearanceFooter}>
        <Lock size={12} className={styles.appearanceLockIcon} />
        <span>{c.refreshHint}</span>
      </footer>
    </section>
  );
}

// 导出小工具供测试和其他组件使用
export { asKkProfile };
