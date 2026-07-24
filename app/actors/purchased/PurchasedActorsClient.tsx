"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, LoaderCircle, PackageOpen } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { ActorCard } from "@/components/actors/ActorCard";
import { GrantTypeBadge } from "@/components/marketplace/GrantTypeBadge";
import { actorLibraryCopy } from "@/components/actors/actor-copy";
import { toActorCard } from "@/components/actors/actor-view-model";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "@/components/actors/actors.module.css";
import purchasedStyles from "./purchased.module.css";
import type { PurchasedActorItem } from "@/lib/supabase/marketplace-queries";

export type InitialPurchasedPayload = {
  initialItems: PurchasedActorItem[];
  initialCursor: string | null;
  hasMore: boolean;
  total: number;
  initialScope: "all" | "global" | "project";
  initialProjectId: string | null;
};

type ScopeFilter = "all" | "global" | "project";

type Props = {
  initial: InitialPurchasedPayload;
};

/**
 * 已购演员列表客户端组件：
 * - 顶部：标题"已购演员 · X 个" + 筛选 Tab（全部/通用授权/项目专属）
 * - 4 列网格，复用 ActorCard + GrantTypeBadge
 * - 客户端分页：加载更多按钮
 * - 调用 /api/actors/purchased
 */
export function PurchasedActorsClient({ initial }: Props) {
  const { locale, t } = useI18n();
  const isZh = locale === "zh-CN";
  const ui = actorLibraryCopy[isZh ? "zh" : "en"];

  const [items, setItems] = useState<PurchasedActorItem[]>(initial.initialItems);
  const [cursor, setCursor] = useState<string | null>(initial.initialCursor);
  const [hasMore, setHasMore] = useState<boolean>(initial.hasMore);
  const [total, setTotal] = useState<number>(initial.total);
  const [scope, setScope] = useState<ScopeFilter>(initial.initialScope);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 切 Tab 时重置并重新拉取
  const reload = useCallback(
    async (nextScope: ScopeFilter) => {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams({ limit: "12" });
        if (nextScope !== "all") params.set("scope", nextScope);
        const response = await fetch(`/api/actors/purchased?${params.toString()}`, { credentials: "include" });
        const json = await response.json();
        if (!response.ok || !json.success) {
          throw new Error(json.error || (isZh ? "加载失败" : "Failed to load"));
        }
        setItems(json.items || []);
        setCursor(json.nextCursor || null);
        setHasMore(Boolean(json.hasMore));
        setTotal(typeof json.total === "number" ? json.total : (json.items || []).length);
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : isZh ? "加载失败" : "Failed to load");
        setItems([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    },
    [isZh],
  );

  useEffect(() => {
    // 仅在初始 scope 与默认不一致时才触发；初次进入页面 SSR 已带数据
    if (scope !== initial.initialScope) {
      void reload(scope);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loading || !cursor) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "12", cursor });
      if (scope !== "all") params.set("scope", scope);
      const response = await fetch(`/api/actors/purchased?${params.toString()}`, { credentials: "include" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        throw new Error(json.error || (isZh ? "加载失败" : "Failed to load"));
      }
      setItems((current) => [...current, ...(json.items || [])]);
      setCursor(json.nextCursor || null);
      setHasMore(Boolean(json.hasMore));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : isZh ? "加载失败" : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [hasMore, loading, cursor, scope, isZh]);

  const cards = useMemo(
    () => items.map((item) =>
      toActorCard(
        {
          id: item.actor_id,
          name: item.actor_name,
          avatar_url: item.actor_avatar_asset_id,
        },
        3,
      ),
    ),
    [items],
  );

  const showEmpty = !loading && items.length === 0;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.topbarBrand} href="/">
          <KiikisLogo compact />
        </Link>
        <div className={styles.topbarTitles}>
          <p className={styles.kicker}>{isZh ? "KIikis Talent" : "KIikis Talent"}</p>
          <h1 className={styles.title}>
            {t("purchased.title")} · {total} {isZh ? "个" : ""}
          </h1>
          <p className={styles.subtitle}>{isZh ? "你购买或领取过的演员" : "Actors you have purchased or claimed"}</p>
        </div>
        <span className={styles.topbarSpacer} />
        <Link className={styles.ghostBtn} href="/actors">
          <ArrowLeft size={14} />
          {ui.backToLibrary}
        </Link>
      </header>

      <section className={purchasedStyles.filterBar} aria-label={t("purchased.title")}>
        <div className={purchasedStyles.filterGroup} role="group" aria-label="scope filter">
          {(["all", "global", "project"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={scope === value ? `${styles.chipBtn} ${styles.chipBtnActive}` : styles.chipBtn}
              aria-pressed={scope === value}
              onClick={() => setScope(value)}
            >
              {value === "all"
                ? t("purchased.filter.all")
                : value === "global"
                  ? t("purchased.filter.global")
                  : t("purchased.filter.project")}
            </button>
          ))}
        </div>
      </section>

      {error ? <div className={styles.noticeBar} role="alert">{error}</div> : null}

      {showEmpty ? (
        <section className={styles.statePanel}>
          <PackageOpen size={22} color="#8f999b" />
          <h2>{t("purchased.empty")}</h2>
          <p>{isZh ? "去市场看看其他创作者的演员" : "Explore actors from other creators"}</p>
          <Link className={styles.primaryBtn} href="/actors">{t("marketplace.title")}</Link>
        </section>
      ) : (
        <section className={styles.gridWrap}>
          <ul className={styles.grid}>
            {cards.map((card, index) => {
              const item = items[index];
              return (
                <li key={card.id} className={purchasedStyles.cardWrap}>
                  <ActorCard card={card} copy={ui} />
                  <div className={purchasedStyles.cardFooter}>
                    <GrantTypeBadge grantType={item.grant_type} />
                  </div>
                </li>
              );
            })}
          </ul>
          {hasMore ? (
            <div className={purchasedStyles.loadMoreRow}>
              <button
                type="button"
                className={styles.primaryBtn}
                onClick={() => void loadMore()}
                disabled={loading}
              >
                {loading ? <LoaderCircle size={14} className={styles.spin} /> : null}
                {isZh ? "加载更多" : "Load more"}
              </button>
            </div>
          ) : null}
        </section>
      )}

      {loading && !showEmpty ? (
        <span style={{ position: "fixed", right: 20, bottom: 20, color: "#8f999b" }} aria-hidden="true">
          <LoaderCircle className={styles.spin} size={16} />
        </span>
      ) : null}
    </main>
  );
}
