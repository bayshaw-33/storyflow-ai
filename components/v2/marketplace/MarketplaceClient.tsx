"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, SlidersHorizontal, Sparkles, X } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import { fetchMarketplace, isUnauthenticatedError } from "@/lib/client/v2/marketplace/api";
import type {
  MarketplaceAssetType,
  MarketplaceDataset,
  MarketplaceFilter,
  MarketplaceStatus,
  AssetStatus,
} from "@/lib/client/v2/marketplace/types";
import { DEFAULT_FILTER, ALL_ASSET_TYPES, ALL_LICENSE_TYPES } from "@/lib/client/v2/marketplace/types";
import {
  assetTypeLabel,
  licenseTypeLabel,
  queryAssets,
} from "@/lib/client/v2/marketplace/filtering";
import { AssetCard } from "./AssetCard";
import styles from "./marketplace.module.css";

export function MarketplaceClient() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [dataset, setDataset] = useState<MarketplaceDataset | null>(null);
  const [status, setStatus] = useState<MarketplaceStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [filter, setFilter] = useState<MarketplaceFilter>({ ...DEFAULT_FILTER });
  const [showFilters, setShowFilters] = useState(false);

  // 监听 Supabase 登录态（fixture 模式下可预览，不强制登录）
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setSessionLoaded(true);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: authData } = await client.auth.getSession();
        if (!active) return;
        setSession(authData.session);
        setSessionLoaded(true);
      } catch {
        if (active) setSessionLoaded(true);
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    try {
      const result = await fetchMarketplace(session?.access_token || null);
      setDataset(result.dataset);
      setStatus(result.dataset.assets.length === 0 ? "empty" : "ready");
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(err instanceof Error ? err.message : isZh ? "加载市场数据失败。" : "Failed to load marketplace.");
      setStatus("error");
    }
  }, [session, isZh]);

  useEffect(() => {
    if (!sessionLoaded) return;
    void load();
  }, [sessionLoaded, load]);

  // 搜索 + 筛选 + 排序
  const visibleAssets = useMemo(() => {
    if (!dataset) return [];
    return queryAssets(dataset.assets, filter);
  }, [dataset, filter]);

  const recommendedAssets = useMemo(
    () => visibleAssets.filter((a) => a.recommended === true),
    [visibleAssets],
  );

  const toggleType = (type: MarketplaceAssetType) => {
    setFilter((f) => ({
      ...f,
      types: f.types.includes(type) ? f.types.filter((t) => t !== type) : [...f.types, type],
    }));
  };

  const toggleLicense = (license: string) => {
    setFilter((f) => ({
      ...f,
      licenseTypes: f.licenseTypes.includes(license as never)
        ? f.licenseTypes.filter((t) => t !== license)
        : [...f.licenseTypes, license as never],
    }));
  };

  const toggleStatus = (s: AssetStatus) => {
    setFilter((f) => ({
      ...f,
      statuses: f.statuses.includes(s) ? f.statuses.filter((t) => t !== s) : [...f.statuses, s],
    }));
  };

  const resetFilter = () => setFilter({ ...DEFAULT_FILTER });

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.loading}>{isZh ? "加载市场数据中..." : "Loading marketplace..."}</div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {isZh ? "请先登录后访问市场。" : "Please log in to access the marketplace."}
          </p>
          <button type="button" className={styles.buttonPrimary} onClick={() => router.push("/login")}>
            {isZh ? "去登录" : "Log in"}
          </button>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.errorBox}>{errorMsg}</div>
          <button type="button" className={styles.buttonPrimary} onClick={() => void load()}>
            {isZh ? "重试" : "Retry"}
          </button>
        </div>
      </main>
    );
  }

  if (!dataset) return null;

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        {/* 头部 */}
        <header className={styles.header}>
          <div className={styles.headerRow}>
            <div>
              <p className={styles.eyebrow}>Kiikis 2.0 · Marketplace</p>
              <h1 className={styles.title}>{isZh ? "演员与资产市场" : "Actor & Asset Marketplace"}</h1>
              <p className={styles.subtitle}>
                {isZh
                  ? "发现可授权的 AI 演员、角色、场景、道具、风格包与世界观设定。"
                  : "Discover licensable AI actors, characters, scenes, props, style packs and universe settings."}
              </p>
            </div>
            <div className={styles.headerActions}>
              <button
                type="button"
                className={styles.buttonPrimary}
                onClick={() => router.push("/business/marketplace/publish")}
              >
                {isZh ? "发布资产" : "Publish asset"}
              </button>
            </div>
          </div>
        </header>

        {/* 统计条 */}
        <div className={styles.statsBar}>
          <span className={styles.statItem}>
            {isZh ? "资产总数" : "Total"} <span className={styles.statNum}>{dataset.stats.totalAssets}</span>
          </span>
          {ALL_ASSET_TYPES.map((t) => (
            <span key={t} className={styles.statItem}>
              {assetTypeLabel(t, locale)} <span className={styles.statNum}>{dataset.stats.byType[t]}</span>
            </span>
          ))}
        </div>

        {/* 推荐可解释说明 */}
        {recommendedAssets.length > 0 && (
          <div className={styles.recommendBanner}>
            <Sparkles size={14} style={{ flexShrink: 0, marginTop: 1, color: "#6de7df" }} />
            <span>
              {isZh
                ? "推荐基于你当前项目的风格与用途匹配，"
                : "Recommendations are based on your project style and usage match, "}
              <strong>{isZh ? "不按付费排序" : "not by payment ranking"}</strong>
              {isZh ? "。每项推荐均有可解释理由。" : ". Each has an explainable reason."}
            </span>
          </div>
        )}

        {/* 搜索 + 筛选栏 */}
        <div className={styles.toolbar}>
          <div className={styles.searchBox}>
            <Search size={14} style={{ color: "rgba(255,255,255,0.4)" }} />
            <input
              className={styles.searchInput}
              placeholder={isZh ? "搜索名称、标签、类型、用途..." : "Search name, tag, type, use..."}
              value={filter.query}
              onChange={(e) => setFilter((f) => ({ ...f, query: e.target.value }))}
            />
            {filter.query && (
              <button
                type="button"
                onClick={() => setFilter((f) => ({ ...f, query: "" }))}
                style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", padding: 0 }}
                aria-label="clear"
              >
                <X size={12} />
              </button>
            )}
          </div>
          <button
            type="button"
            className={`${styles.button} ${showFilters ? styles.buttonPrimary : ""}`}
            onClick={() => setShowFilters((v) => !v)}
          >
            <SlidersHorizontal size={12} />
            {isZh ? "筛选" : "Filters"}
          </button>
          {(filter.types.length > 0 ||
            filter.licenseTypes.length > 0 ||
            filter.statuses.length > 0 ||
            filter.freeOnly ||
            filter.paidOnly) && (
            <button type="button" className={styles.button} onClick={resetFilter}>
              {isZh ? "重置" : "Reset"}
            </button>
          )}
        </div>

        {/* 展开筛选区 */}
        {showFilters && (
          <div className={styles.toolbar} style={{ flexDirection: "column", alignItems: "stretch" }}>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{isZh ? "类型" : "Type"}:</span>
              {ALL_ASSET_TYPES.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.chip} ${filter.types.includes(t) ? styles.chipActive : ""}`}
                  onClick={() => toggleType(t)}
                >
                  {assetTypeLabel(t, locale)}
                </button>
              ))}
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{isZh ? "授权" : "License"}:</span>
              {ALL_LICENSE_TYPES.map((l) => (
                <button
                  key={l}
                  type="button"
                  className={`${styles.chip} ${filter.licenseTypes.includes(l) ? styles.chipActive : ""}`}
                  onClick={() => toggleLicense(l)}
                >
                  {licenseTypeLabel(l, locale)}
                </button>
              ))}
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{isZh ? "价格" : "Price"}:</span>
              <button
                type="button"
                className={`${styles.chip} ${filter.freeOnly ? styles.chipActive : ""}`}
                onClick={() => setFilter((f) => ({ ...f, freeOnly: !f.freeOnly, paidOnly: false }))}
              >
                {isZh ? "免费" : "Free"}
              </button>
              <button
                type="button"
                className={`${styles.chip} ${filter.paidOnly ? styles.chipPaidActive : ""}`}
                onClick={() => setFilter((f) => ({ ...f, paidOnly: !f.paidOnly, freeOnly: false }))}
              >
                {isZh ? "付费" : "Paid"}
              </button>
            </div>
            <div className={styles.filterGroup}>
              <span className={styles.filterLabel}>{isZh ? "状态" : "Status"}:</span>
              {(["published", "ready", "suspended"] as AssetStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.chip} ${filter.statuses.includes(s) ? styles.chipActive : ""}`}
                  onClick={() => toggleStatus(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 资产网格 */}
        {visibleAssets.length === 0 ? (
          <div className={styles.empty}>
            {isZh ? "没有匹配的资产，试试调整筛选条件。" : "No matching assets. Try adjusting filters."}
          </div>
        ) : (
          <div className={styles.grid}>
            {visibleAssets.map((asset) => (
              <AssetCard
                key={asset.id}
                asset={asset}
                onClick={(id) => router.push(`/business/marketplace/${id}`)}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
