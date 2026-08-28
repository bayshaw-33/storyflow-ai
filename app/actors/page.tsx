"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, LoaderCircle, Plus, Search, TriangleAlert, Users } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { ActorCard } from "@/components/actors/ActorCard";
import { CreateActorModal } from "@/components/actors/CreateActorModal";
import { ActorMarketSection } from "@/components/marketplace/ActorMarketSection";
import { actorApiFetch } from "@/components/actors/actor-client";
import { actorLibraryCopy } from "@/components/actors/actor-copy";
import {
  collectActorTags,
  filterActors,
  filterByStatus,
  filterByTag,
  sortActors,
  toActorCard,
  type ActorSortKey,
  type ActorStatusFilter,
} from "@/components/actors/actor-view-model";
import { useActorSession } from "@/components/actors/use-actor-session";
import styles from "@/components/actors/actors.module.css";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ActorProfile } from "@/lib/actors";

type ActorListPayload = {
  actors: ActorProfile[];
  storageMode?: "structured" | "project_snapshot" | "unavailable";
  warning?: string;
};

// 演员库 · 模特公司模式：白底正面特写卡片墙。
// PRD §7.1：搜索 + 状态筛选 + 标签筛选 + 排序 + 三态 + 文字/头像创建入口。
// PRD §11：未知服务端错误必须显式展示，不得伪装成空演员库。
export default function ActorsPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const ui = actorLibraryCopy[isZh ? "zh" : "en"];
  const router = useRouter();
  const { session, sessionLoaded } = useActorSession();

  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [portrayalCounts, setPortrayalCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<ActorStatusFilter>("all");
  const [tagFilter, setTagFilter] = useState("");
  const [sortKey, setSortKey] = useState<ActorSortKey>("updated");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError("");
    try {
      const result = await actorApiFetch<ActorListPayload>("/api/actors", session.access_token);
      const list = Array.isArray(result.actors) ? result.actors : [];
      setActors(list);
      setWarning(
        result.warning || (result.storageMode && result.storageMode !== "structured" ? ui.fallbackWarning : ""),
      );
      // 并行补全参演数（最多 24 位，超出按需进入详情页查看；避免 N+1 风暴）
      void enrichPortrayalCounts(list);
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : ui.errorTitle);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, ui.errorTitle, ui.fallbackWarning]);

  // PRD §7.1 优化：用 /api/actors/portrayals/counts 批量查询，避免 N+1（原 24 次 GET → 1 次 batch）
  const enrichPortrayalCounts = useCallback(
    async (targets: ActorProfile[]) => {
      if (!session?.access_token || !targets.length) return;
      const token = session.access_token;
      try {
        const ids = targets.map((actor) => actor.id).join(",");
        const result = await actorApiFetch<{ counts?: Record<string, number> }>(
          `/api/actors/portrayals/counts?ids=${encodeURIComponent(ids)}`,
          token,
        );
        const counts = result.counts || {};
        setPortrayalCounts((current) => ({ ...current, ...counts }));
      } catch {
        // 批量失败不阻塞列表渲染；portrayalCount 保持 0
      }
    },
    [session?.access_token],
  );

  useEffect(() => {
    if (session?.access_token) void load();
  }, [session?.access_token, load]);

  const availableTags = useMemo(() => collectActorTags(actors, 12), [actors]);

  const enrichedActors = useMemo(
    () => actors.map((actor) => ({ ...actor, portrayalCount: portrayalCounts[actor.id] ?? 0 })),
    [actors, portrayalCounts],
  );

  const cards = useMemo(() => {
    const filtered = filterActors(enrichedActors, query);
    const byStatus = filterByStatus(filtered, statusFilter);
    const byTag = tagFilter ? filterByTag(byStatus, tagFilter) : byStatus;
    const sorted = sortActors(byTag, sortKey);
    return sorted.map((actor) => toActorCard(actor, 3));
  }, [enrichedActors, query, statusFilter, tagFilter, sortKey]);

  function handleCreated(actor: ActorProfile) {
    setCreateOpen(false);
    // 创建成功必须立即可见：先本地置顶插入，再进入详情页；后台刷新失败也不影响。
    setActors((current) => [actor, ...current.filter((item) => item.id !== actor.id)]);
    router.push(`/actors/${actor.id}`);
    void load();
  }

  const authRequired = sessionLoaded && !session;
  const showEmpty = !loading && !error && actors.length === 0;
  const showNoResult = !loading && !error && actors.length > 0 && cards.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.topbarBrand} href="/">
          <KiikisLogo compact />
        </Link>
        <div className={styles.topbarTitles}>
          <p className={styles.kicker}>{ui.listKicker}</p>
          <h1 className={styles.title}>{ui.listTitle}</h1>
          <p className={styles.subtitle}>{ui.listSubtitle}</p>
        </div>
        <span className={styles.topbarSpacer} />
        {!authRequired ? (
          <>
            <span className={styles.countNote}>
              {actors.length} {ui.actorCount}
            </span>
            <label className={styles.searchBox}>
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={ui.searchPlaceholder}
                aria-label={ui.searchPlaceholder}
              />
            </label>
            <Link
              className={styles.ghostBtn}
              href={session ? "/actors/purchased" : "/login?next=/actors/purchased"}
            >
              {isZh ? "已购" : "Purchased"}
            </Link>
            <button className={styles.primaryBtn} type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={15} />
              {ui.newActor}
            </button>
          </>
        ) : null}
      </header>

      {!authRequired && actors.length > 0 ? (
        <section className={styles.filterBar} aria-label={ui.filterBarAria}>
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{ui.statusFilterLabel}</span>
            <div className={styles.filterButtons} role="group" aria-label={ui.statusFilterLabel}>
              {(["all", "ready", "draft"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  className={statusFilter === value ? `${styles.chipBtn} ${styles.chipBtnActive}` : styles.chipBtn}
                  aria-pressed={statusFilter === value}
                  onClick={() => setStatusFilter(value)}
                >
                  {value === "all" ? ui.statusAll : value === "ready" ? ui.statusReady : ui.statusDraft}
                </button>
              ))}
            </div>
          </div>
          {availableTags.length ? (
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{ui.tagFilterLabel}</span>
              <div className={styles.filterButtons} role="group" aria-label={ui.tagFilterLabel}>
                <button
                  type="button"
                  className={!tagFilter ? `${styles.chipBtn} ${styles.chipBtnActive}` : styles.chipBtn}
                  aria-pressed={!tagFilter}
                  onClick={() => setTagFilter("")}
                >
                  {ui.tagAll}
                </button>
                {availableTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    className={tagFilter === tag ? `${styles.chipBtn} ${styles.chipBtnActive}` : styles.chipBtn}
                    aria-pressed={tagFilter === tag}
                    onClick={() => setTagFilter(tag === tagFilter ? "" : tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <div className={styles.filterGroup}>
            <span className={styles.filterLabel}>{ui.sortLabel}</span>
            <select
              className={styles.sortSelect}
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as ActorSortKey)}
              aria-label={ui.sortLabel}
            >
              <option value="updated">{ui.sortUpdated}</option>
              <option value="name">{ui.sortName}</option>
              <option value="portrayals">{ui.sortPortrayals}</option>
            </select>
          </div>
        </section>
      ) : null}

      {warning ? (
        <div className={styles.noticeBar} role="status">
          <TriangleAlert size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {warning}
        </div>
      ) : null}

      {authRequired ? (
        <section className={styles.statePanel}>
          <p className={styles.kicker}>{ui.authKicker}</p>
          <h2>{ui.authTitle}</h2>
          <p>{ui.authBody}</p>
          <Link className={styles.primaryBtn} href="/login">
            {ui.signIn}
          </Link>
        </section>
      ) : loading ? (
        <section className={styles.gridWrap} aria-busy="true" aria-label={ui.loading}>
          <ul className={styles.grid}>
            {Array.from({ length: 10 }, (_, index) => (
              <li key={index}>
                <div className={styles.skeletonCard} />
              </li>
            ))}
          </ul>
        </section>
      ) : error ? (
        <section className={styles.statePanel}>
          <TriangleAlert size={22} color="#ffb1b3" />
          <h2>{ui.errorTitle}</h2>
          <p>{error}</p>
          <button className={styles.primaryBtn} type="button" onClick={() => void load()}>
            {ui.retry}
          </button>
        </section>
      ) : showEmpty ? (
        <section className={styles.statePanel}>
          <Users size={22} color="#6de7df" />
          <h2>{ui.emptyTitle}</h2>
          <p>{ui.emptyBody}</p>
          <button className={styles.primaryBtn} type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            {ui.emptyAction}
          </button>
        </section>
      ) : showNoResult ? (
        <section className={styles.statePanel}>
          <ImageOff size={22} color="#8f999b" />
          <h2>{ui.noResultTitle}</h2>
          <p>{ui.noResultBody}</p>
          <button
            className={styles.ghostBtn}
            type="button"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
              setTagFilter("");
            }}
          >
            {ui.tagAll}
          </button>
        </section>
      ) : (
        <section className={styles.gridWrap}>
          <ul className={styles.grid}>
            {cards.map((card) => (
              <ActorCard key={card.id} card={card} copy={ui} />
            ))}
          </ul>
        </section>
      )}

      {loading && !authRequired ? (
        <span style={{ position: "fixed", right: 20, bottom: 20, color: "#8f999b" }} aria-hidden="true">
          <LoaderCircle className={styles.spin} size={16} />
        </span>
      ) : null}

      <ActorMarketSection viewerToken={session?.access_token || null} sessionLoaded={sessionLoaded} />

      <CreateActorModal open={createOpen} token={session?.access_token || ""} copy={ui} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </main>
  );
}
