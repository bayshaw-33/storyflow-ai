"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import { LetterAvatar } from "./LetterAvatar";
import type { Profile, ProfileStats } from "./types";
import styles from "./profile.module.css";

type ProfileHeaderProps = {
  profile: Profile;
  stats: ProfileStats;
  isOwner: boolean;
};

const PLAN_LABEL_ZH: Record<string, string> = {
  free: "免费版",
  elite: "Elite",
  pro: "Pro",
  ultra: "Ultra",
};

const PLAN_LABEL_EN: Record<string, string> = {
  free: "Free",
  elite: "Elite",
  pro: "Pro",
  ultra: "Ultra",
};

/**
 * 主页顶部资料卡：头像 + 名称 + @username + plan badge + bio + 统计数字行。
 * 本人访问时显示「编辑」按钮，链接到 /settings/profile。
 */
export function ProfileHeader({ profile, stats, isOwner }: ProfileHeaderProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const displayName = profile.display_name?.trim() || profile.username || (isZh ? "匿名用户" : "Anonymous");
  const planLabel = (() => {
    const plan = profile.plan || "free";
    return isZh ? PLAN_LABEL_ZH[plan] ?? plan : PLAN_LABEL_EN[plan] ?? plan;
  })();

  const statItems = [
    { value: stats.works_count, label: isZh ? "作品" : "Works" },
    { value: stats.universes_count, label: isZh ? "宇宙" : "Universes" },
    { value: stats.actors_count, label: isZh ? "演员" : "Actors" },
    { value: stats.used_count, label: isZh ? "被使用" : "Used" },
    { value: stats.adapted_count, label: isZh ? "被改编" : "Adapted" },
  ];

  return (
    <header className={styles.header}>
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={displayName}
          width={80}
          height={80}
          className={styles.letterAvatar}
          style={{ objectFit: "cover" }}
        />
      ) : (
        <LetterAvatar displayName={displayName} userId={profile.user_id} size={80} />
      )}

      <div className={styles.headerMain}>
        <div className={styles.headerTop}>
          <h1 className={styles.displayName}>{displayName}</h1>
          {profile.username ? <span className={styles.username}>@{profile.username}</span> : null}
          <span className={styles.planBadge}>{planLabel}</span>
        </div>

        {profile.bio ? <p className={styles.bio}>{profile.bio}</p> : null}

        {profile.creative_tags?.length ? (
          <div className={styles.tagRow}>
            {profile.creative_tags.slice(0, 5).map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        ) : null}

        <div className={styles.statsRow}>
          {statItems.map((item) => (
            <div key={item.label} className={styles.stat}>
              <span className={styles.statValue}>{item.value}</span>
              <span className={styles.statLabel}>{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      {isOwner ? (
        <Link href="/settings/profile" className={styles.editButton}>
          <Pencil size={14} />
          {isZh ? "编辑" : "Edit"}
        </Link>
      ) : null}
    </header>
  );
}
