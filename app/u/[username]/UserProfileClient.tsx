"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs } from "@/components/profile/ProfileTabs";
import { WorksGrid } from "@/components/profile/WorksGrid";
import { UniversesGrid } from "@/components/profile/UniversesGrid";
import { ActorsGrid } from "@/components/profile/ActorsGrid";
import { BadgesGrid } from "@/components/profile/BadgesGrid";
import { useI18n } from "@/lib/i18n/useI18n";
import type {
  Actor,
  Badge,
  Profile,
  ProfileStats,
  TabDef,
  TabKey,
  Universe,
  Work,
} from "@/components/profile/types";

// ============================================================
// 类型
// ============================================================

export type InitialProfilePayload = {
  profile: Profile & { is_owner?: boolean };
  stats: ProfileStats;
  badges: Badge[];
  initialWorks: {
    items: Work[];
    nextCursor: string | null;
    hasMore: boolean;
  };
};

type TabState<T> = {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
  loading: boolean;
  loaded: boolean;
};

const emptyTabState = <T,>(): TabState<T> => ({
  items: [],
  nextCursor: null,
  hasMore: false,
  loading: false,
  loaded: false,
});

// ============================================================
// 主组件
// ============================================================

/**
 * 公开主页客户端：
 * - SSR 注入 initial（profile + stats + badges + works 首屏）
 * - Tab 切换通过 URL ?tab=xxx 持久化
 * - universes / actors Tab 首次激活时 fetch /api/u/[username]/<tab>
 * - works Tab 继续使用 SSR 注入的首屏，分页时 fetch /api/u/[username]/works
 */
export function UserProfileClient({ initial }: { initial: InitialProfilePayload }) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const username = initial.profile.username ?? "";

  // 从 URL 读取 activeTab，默认 works
  const queryTab = (searchParams?.get("tab") as TabKey | null) ?? "works";
  const activeTab: TabKey = ["works", "universes", "actors", "badges"].includes(queryTab)
    ? queryTab
    : "works";

  // works 直接使用 SSR 注入的首屏
  const [works, setWorks] = useState<TabState<Work>>({
    items: initial.initialWorks.items,
    nextCursor: initial.initialWorks.nextCursor,
    hasMore: initial.initialWorks.hasMore,
    loading: false,
    loaded: true,
  });
  const [universes, setUniverses] = useState<TabState<Universe>>(emptyTabState());
  const [actors, setActors] = useState<TabState<Actor>>(emptyTabState());

  // Tab 定义（含统计数字）
  const tabs: TabDef[] = useMemo(
    () => [
      { key: "works", label: t("profile.tab.works"), count: initial.stats.works_count },
      { key: "universes", label: t("profile.tab.universes"), count: initial.stats.universes_count },
      { key: "actors", label: t("profile.tab.actors"), count: initial.stats.actors_count },
      { key: "badges", label: t("profile.tab.badges"), count: initial.badges.length },
    ],
    [t, initial.stats, initial.badges.length],
  );

  // 拉取 universes / actors 首屏
  const fetchTab = useCallback(
    async (
      tab: "universes" | "actors",
      setter: (fn: (prev: TabState<Universe | Actor>) => TabState<Universe | Actor>) => void,
      mapper: (raw: Record<string, unknown>) => Universe | Actor,
    ) => {
      setter((prev) => ({ ...prev, loading: true }));
      try {
        const res = await fetch(`/api/u/${encodeURIComponent(username)}/${tab}?limit=12`);
        const payload = (await res.json().catch(() => null)) as
          | { success: true; items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean }
          | null;
        if (res.ok && payload?.success) {
          setter(() => ({
            items: payload.items.map(mapper) as Universe[] | Actor[],
            nextCursor: payload.nextCursor,
            hasMore: payload.hasMore,
            loading: false,
            loaded: true,
          }));
        } else {
          setter((prev) => ({ ...prev, loading: false, loaded: true }));
        }
      } catch {
        setter((prev) => ({ ...prev, loading: false, loaded: true }));
      }
    },
    [username],
  );

  // 首次切到 universes / actors 时拉取
  useEffect(() => {
    if (activeTab === "universes" && !universes.loaded && !universes.loading) {
      void fetchTab("universes", setUniverses as never, mapUniverse);
    }
    if (activeTab === "actors" && !actors.loaded && !actors.loading) {
      void fetchTab("actors", setActors as never, mapActor);
    }
  }, [activeTab, universes.loaded, universes.loading, actors.loaded, actors.loading, fetchTab]);

  // 分页加载
  const loadMoreWorks = useCallback(async () => {
    if (!works.nextCursor || works.loading) return;
    setWorks((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(
        `/api/u/${encodeURIComponent(username)}/works?cursor=${encodeURIComponent(works.nextCursor!)}&limit=12`,
      );
      const payload = (await res.json().catch(() => null)) as
        | { success: true; items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean }
        | null;
      if (res.ok && payload?.success) {
        setWorks((prev) => ({
          items: [...prev.items, ...payload.items.map(mapWork)],
          nextCursor: payload.nextCursor,
          hasMore: payload.hasMore,
          loading: false,
          loaded: true,
        }));
      } else {
        setWorks((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setWorks((prev) => ({ ...prev, loading: false }));
    }
  }, [username, works.nextCursor, works.loading]);

  const loadMoreUniverses = useCallback(async () => {
    if (!universes.nextCursor || universes.loading) return;
    setUniverses((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(
        `/api/u/${encodeURIComponent(username)}/universes?cursor=${encodeURIComponent(universes.nextCursor!)}&limit=12`,
      );
      const payload = (await res.json().catch(() => null)) as
        | { success: true; items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean }
        | null;
      if (res.ok && payload?.success) {
        setUniverses((prev) => ({
          items: [...prev.items, ...payload.items.map(mapUniverse)],
          nextCursor: payload.nextCursor,
          hasMore: payload.hasMore,
          loading: false,
          loaded: true,
        }));
      } else {
        setUniverses((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setUniverses((prev) => ({ ...prev, loading: false }));
    }
  }, [username, universes.nextCursor, universes.loading]);

  const loadMoreActors = useCallback(async () => {
    if (!actors.nextCursor || actors.loading) return;
    setActors((prev) => ({ ...prev, loading: true }));
    try {
      const res = await fetch(
        `/api/u/${encodeURIComponent(username)}/actors?cursor=${encodeURIComponent(actors.nextCursor!)}&limit=12`,
      );
      const payload = (await res.json().catch(() => null)) as
        | { success: true; items: Record<string, unknown>[]; nextCursor: string | null; hasMore: boolean }
        | null;
      if (res.ok && payload?.success) {
        setActors((prev) => ({
          items: [...prev.items, ...payload.items.map(mapActor)],
          nextCursor: payload.nextCursor,
          hasMore: payload.hasMore,
          loading: false,
          loaded: true,
        }));
      } else {
        setActors((prev) => ({ ...prev, loading: false }));
      }
    } catch {
      setActors((prev) => ({ ...prev, loading: false }));
    }
  }, [username, actors.nextCursor, actors.loading]);

  // ProfileHeader 需要的 profile 形状
  const headerProfile: Profile = {
    user_id: initial.profile.user_id,
    username: initial.profile.username,
    display_name: initial.profile.display_name,
    bio: initial.profile.bio,
    avatar_url: initial.profile.avatar_url,
    avatar_asset_id: initial.profile.avatar_asset_id,
    creative_tags: initial.profile.creative_tags,
    social_links: initial.profile.social_links,
    location: initial.profile.location,
    language_preference: initial.profile.language_preference,
    pronouns: initial.profile.pronouns,
    profile_visibility: initial.profile.profile_visibility,
    plan: initial.profile.plan,
    username_changed_at: initial.profile.username_changed_at,
    username_set_at: initial.profile.username_set_at,
  };

  return (
    <main className="cosmic-page profile-page">
      <header className="cosmic-page-header">
        <Link href="/"><KiikisLogo compact /></Link>
      </header>

      <section className="cosmic-title-band">
        <span>{t("profile.viewMyProfile")}</span>
        <h1>{initial.profile.display_name || initial.profile.username || t("profile.anonymous")}</h1>
      </section>

      <div className="profile-page-body">
        <ProfileHeader
          profile={headerProfile}
          stats={initial.stats}
          isOwner={Boolean(initial.profile.is_owner)}
        />

        <ProfileTabs tabs={tabs} activeTab={activeTab} onTabChange={() => { /* URL-driven */ }} />

        <div className="profile-tab-panel">
          {activeTab === "works" ? (
            <WorksGrid
              works={works.items}
              loading={works.loading}
              hasMore={works.hasMore}
              onLoadMore={loadMoreWorks}
            />
          ) : null}

          {activeTab === "universes" ? (
            <UniversesGrid
              universes={universes.items}
              loading={universes.loading}
              hasMore={universes.hasMore}
              onLoadMore={loadMoreUniverses}
            />
          ) : null}

          {activeTab === "actors" ? (
            <ActorsGrid
              actors={actors.items}
              loading={actors.loading}
              hasMore={actors.hasMore}
              onLoadMore={loadMoreActors}
            />
          ) : null}

          {activeTab === "badges" ? <BadgesGrid badges={initial.badges} /> : null}
        </div>
      </div>
    </main>
  );
}

// ============================================================
// API 响应 → 前端类型 映射
// ============================================================

function mapWork(raw: Record<string, unknown>): Work {
  return {
    id: String(raw.id ?? ""),
    title: String(raw.title ?? ""),
    cover_url: null,
    status: String(raw.status ?? "draft"),
    updated_at: (raw.updated_at as string) ?? (raw.created_at as string) ?? null,
  };
}

function mapUniverse(raw: Record<string, unknown>): Universe {
  const tags: string[] = [];
  const genre = raw.genre as string | null;
  if (genre) tags.push(genre);
  const targetMarkets = raw.target_markets;
  if (Array.isArray(targetMarkets)) {
    for (const m of targetMarkets) {
      if (typeof m === "string") tags.push(m);
    }
  }
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    card_summary: (raw.description as string) ?? null,
    cover_url: null,
    status: String(raw.status ?? "active"),
    tags,
    updated_at: (raw.updated_at as string) ?? (raw.created_at as string) ?? null,
  };
}

function mapActor(raw: Record<string, unknown>): Actor {
  const bio = (raw.bio as string) ?? null;
  const ageRange = (raw.age_range as string) ?? null;
  const subtitle = [ageRange, bio].filter(Boolean).join(" · ");
  // 服务端 query 在 profile-queries.ts 中已 JOIN avatar_asset_id(storage_path) 并拍平到 avatar_storage_path
  const storagePath = (raw.avatar_storage_path as string) ?? null;
  const avatarUrl = storagePath ? buildAvatarUrl(storagePath) : null;

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    avatar_url: avatarUrl,
    subtitle: subtitle || null,
    status: "ready",
    visibility: String(raw.visibility ?? "private"),
    tags: [],
    portrayal_count: 0,
  };
}

function buildAvatarUrl(storagePath: string): string | null {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  if (!supabaseUrl) return null;
  return `${supabaseUrl}/storage/v1/object/public/avatars/${storagePath}`;
}
