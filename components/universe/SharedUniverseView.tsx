"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Info } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { SharePermissions } from "./ShareConfigDialog";
import styles from "./universe-share.module.css";

/**
 * 宽松的展示项类型 —— sections 内容由 API 返回，字段不固定，
 * 这里仅取展示所需的最小字段，其余字段保留索引签名以容忍后端模型差异。
 */
type SharedItem = {
  id?: string;
  name?: string;
  title?: string;
  summary?: string;
  description?: string;
  content?: string;
  cover_url?: string;
  avatar_url?: string;
  thumbnail?: string;
  portrait_url?: string;
  role?: string;
  type?: string;
  start_label?: string;
  end_label?: string;
  [key: string]: unknown;
};

export interface SharedUniverseViewProps {
  universe: {
    id: string;
    name: string;
    cover_url?: string;
    tagline?: string;
    description?: string;
    owner_username?: string;
    owner_display_name?: string;
    owner_avatar_url?: string;
  };
  permissions: SharePermissions;
  sections: {
    characters?: SharedItem[] | null;
    scenes?: SharedItem[] | null;
    rules?: SharedItem[] | null;
    actors?: SharedItem[] | null;
    chapters?: SharedItem[] | null;
    timeline?: SharedItem[] | null;
  };
}

type TabKey = "characters" | "scenes" | "actors" | "chapters" | "timeline" | "rules";

const TAB_ORDER: TabKey[] = [
  "characters",
  "scenes",
  "actors",
  "chapters",
  "timeline",
  "rules",
];

const TAB_LABELS: Record<TabKey, { zh: string; en: string }> = {
  characters: { zh: "角色", en: "Characters" },
  scenes: { zh: "场景", en: "Scenes" },
  actors: { zh: "演员", en: "Actors" },
  chapters: { zh: "章节", en: "Chapters" },
  timeline: { zh: "时间线", en: "Timeline" },
  rules: { zh: "世界规则", en: "Rules" },
};

/**
 * 访客视图（客户端组件）。
 * 展示分享的宇宙内容：封面 + 简介 + 仅可见 Tab + 底部"仅供查看"提示条。
 * 所有内容只读，无编辑按钮。Tab 通过 ?tab= 同步。
 */
export function SharedUniverseView({ universe, permissions, sections }: SharedUniverseViewProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const router = useRouter();
  const searchParams = useSearchParams();

  // 仅展示 sections[key]=true 的 Tab（overview 作为顶部简介区，不进 Tab）
  const visibleTabs = useMemo(
    () => TAB_ORDER.filter((t) => permissions.sections[t]),
    [permissions.sections],
  );

  const [activeTab, setActiveTab] = useState<TabKey>(visibleTabs[0] ?? "characters");

  // 从 URL ?tab= 同步
  useEffect(() => {
    const fromUrl = searchParams?.get("tab");
    if (fromUrl && (visibleTabs as string[]).includes(fromUrl)) {
      setActiveTab(fromUrl as TabKey);
    }
  }, [searchParams, visibleTabs]);

  const switchTab = useCallback(
    (next: TabKey) => {
      setActiveTab(next);
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", next);
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const ownerLabel =
    universe.owner_display_name?.trim() ||
    (universe.owner_username ? `@${universe.owner_username}` : "");
  const ownerInitial = (
    universe.owner_display_name ||
    universe.owner_username ||
    "U"
  )
    .slice(0, 1)
    .toUpperCase();

  return (
    <div className={styles.sharedPage}>
      <header className={styles.sharedHeader}>
        {universe.cover_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className={styles.sharedCover} src={universe.cover_url} alt={universe.name} />
        ) : null}

        <div className={styles.sharedTitleRow}>
          <h1 className={styles.sharedName}>{universe.name}</h1>
          {universe.tagline ? <p className={styles.sharedTagline}>{universe.tagline}</p> : null}
          <div className={styles.sharedOwner}>
            {universe.owner_avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                className={styles.sharedOwnerAvatar}
                src={universe.owner_avatar_url}
                alt={ownerLabel}
              />
            ) : (
              <span className={styles.sharedOwnerFallback}>{ownerInitial}</span>
            )}
            {ownerLabel ? (
              <span>
                {isZh ? "创作者" : "by"} {ownerLabel}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {permissions.sections.overview && universe.description ? (
        <section className={styles.sharedOverview}>
          <h2 className={styles.sharedOverviewTitle}>{isZh ? "简介" : "Overview"}</h2>
          <p className={styles.sharedOverviewText}>{universe.description}</p>
        </section>
      ) : null}

      {visibleTabs.length > 0 ? (
        <>
          <nav className={styles.sharedTabs}>
            {visibleTabs.map((t) => (
              <button
                key={t}
                type="button"
                className={`${styles.sharedTab} ${activeTab === t ? styles.sharedTabActive : ""}`}
                onClick={() => switchTab(t)}
              >
                {isZh ? TAB_LABELS[t].zh : TAB_LABELS[t].en}
              </button>
            ))}
          </nav>

          <div className={styles.sharedContent}>
            <TabContent
              tab={activeTab}
              items={sections[activeTab] ?? []}
              isZh={isZh}
            />
          </div>
        </>
      ) : null}

      <div className={styles.sharedFooter}>
        <Info size={12} />
        {isZh ? "这是分享内容，仅供查看" : "Shared content, view only"}
      </div>
    </div>
  );
}

function TabContent({
  tab,
  items,
  isZh,
}: {
  tab: TabKey;
  items: SharedItem[];
  isZh: boolean;
}) {
  if (!items || items.length === 0) {
    return <div className={styles.emptyHint}>{isZh ? "暂无内容" : "No content"}</div>;
  }

  // 角色 / 场景 / 演员 → 卡片网格
  if (tab === "characters" || tab === "scenes" || tab === "actors") {
    return (
      <div className={styles.cardGrid}>
        {items.map((item) => {
          const name = item.name || item.title || "—";
          const img =
            item.cover_url ||
            item.avatar_url ||
            item.thumbnail ||
            item.portrait_url ||
            "";
          const meta = item.role || item.type || item.summary || "";
          return (
            <div key={item.id || name} className={styles.sharedCard}>
              {img ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.sharedCardThumb} src={img} alt={name} />
              ) : (
                <div className={styles.sharedCardThumbFallback}>
                  {name.slice(0, 2).toUpperCase()}
                </div>
              )}
              <p className={styles.sharedCardName}>{name}</p>
              {meta ? <p className={styles.sharedCardMeta}>{String(meta)}</p> : null}
            </div>
          );
        })}
      </div>
    );
  }

  // 章节 / 时间线 / 规则 → 列表
  return (
    <div className={styles.listRow}>
      {items.map((item) => {
        const title = item.name || item.title || item.start_label || "—";
        let meta: string;
        if (item.summary) meta = String(item.summary);
        else if (item.description) meta = String(item.description);
        else if (item.content) meta = String(item.content);
        else if (item.start_label || item.end_label)
          meta = `${item.start_label ?? ""}${item.end_label ? ` → ${item.end_label}` : ""}`;
        else if (item.type) meta = String(item.type);
        else meta = "";
        return (
          <div key={item.id || title} className={styles.listItem}>
            <span className={styles.listItemTitle}>{title}</span>
            {meta ? <span className={styles.listItemMeta}>{meta}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
