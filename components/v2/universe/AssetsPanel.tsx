"use client";

// 交付物 3：资产页
// 角色 / 地点 / 组织 / 道具 / 概念列表，每个对象显示状态、来源、主版本、被使用情况。

import { useEffect, useMemo, useState } from "react";
import { Boxes, Search } from "lucide-react";
import type { UniverseBundleV2, UniverseObjectStatus } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { StatusBadge, GuideHint } from "./shared";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

// 资产统一视图模型。
type AssetRow = {
  id: string;
  name: string;
  summary: string;
  status: UniverseObjectStatus;
  source: string;
  mainVersion: string;
  usedBy: string[];
  kind: string;
};

type UniverseAudioAsset = {
  id: string;
  name: string;
  role: string;
  provider: string | null;
  model: string | null;
  playableUrl: string;
  expiresAt: string;
  createdAt: string;
};

const STATUS_FILTERS: Array<{ value: "all" | UniverseObjectStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "canon", label: "Canon" },
  { value: "draft", label: "Draft" },
  { value: "alternative", label: "Alternative" },
  { value: "deprecated", label: "Deprecated" },
];

export function AssetsPanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | UniverseObjectStatus>("all");
  const [audioAssets, setAudioAssets] = useState<UniverseAudioAsset[]>([]);

  useEffect(() => {
    let active = true;
    const client = getSupabaseBrowserClient();
    void client?.auth.getSession().then(async ({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      const response = await fetch(`/api/v2/universes/${encodeURIComponent(bundle.universe.id)}/audio-assets`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null);
      if (!response?.ok) return;
      const payload = await response.json().catch(() => null) as { audioAssets?: UniverseAudioAsset[] } | null;
      if (active) setAudioAssets(payload?.audioAssets || []);
    });
    return () => { active = false; };
  }, [bundle.universe.id]);

  // 把所有资产聚合为统一列表，标注 kind。
  const allAssets = useMemo<AssetRow[]>(() => {
    const items: AssetRow[] = [];
    for (const c of bundle.characters) items.push({ ...c, kind: "角色" });
    for (const l of bundle.locations) items.push({ ...l, kind: "地点" });
    for (const o of bundle.organizations) items.push({ ...o, kind: "组织" });
    for (const p of bundle.props) items.push({ ...p, kind: "道具" });
    for (const c of bundle.concepts) items.push({ ...c, kind: "概念" });
    return items;
  }, [bundle]);

  const filtered = useMemo(() => {
    return allAssets.filter((a) => {
      if (statusFilter !== "all" && a.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.name.toLowerCase().includes(q) || a.summary.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allAssets, search, statusFilter]);

  // 按 kind 分组。
  const grouped = useMemo(() => {
    const map = new Map<string, AssetRow[]>();
    for (const a of filtered) {
      if (!map.has(a.kind)) map.set(a.kind, []);
      map.get(a.kind)!.push(a);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Boxes size={16} />
            {isZh ? "资产总览" : "Assets"}
            <span className={styles.cardCount}>{allAssets.length} {isZh ? "项" : "items"}</span>
          </h2>
        </div>

        <div className={styles.toolbar}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "rgba(255,255,255,0.4)" }} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label={isZh ? "搜索资产名称或摘要" : "Search asset names or summaries"}
              placeholder={isZh ? "搜索资产名称或摘要…" : "Search asset names or summaries…"}
              style={{
                width: "100%",
                padding: "8px 12px 8px 32px",
                borderRadius: 8,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "rgba(255,255,255,0.04)",
                color: "#f4f7f8",
                fontSize: 13,
                boxSizing: "border-box",
              }}
            />
          </div>
          <select
            aria-label={isZh ? "资产状态" : "Asset status"}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | UniverseObjectStatus)}
            className={styles.button}
            style={{ padding: "8px 10px" }}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value} style={{ background: "#070808" }}>
                {isZh ? ({ all: "全部", canon: "已确认", draft: "草稿", alternative: "备选", deprecated: "已停用" }[s.value]) : s.value === "all" ? "All" : s.label}
              </option>
            ))}
          </select>
        </div>

        {grouped.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyHint}>{allAssets.length === 0
              ? isZh ? "还没有角色、地点或其他资产。添加宇宙实体后会显示在这里。" : "No assets yet. Added Universe entities will appear here."
              : isZh ? "没有匹配的资产。试试调整搜索词或状态筛选。" : "No matching assets. Adjust your search or status filter."}</p>
          </div>
        ) : (
          grouped.map(([kind, items]) => (
            <div key={kind} className={styles.assetGroup}>
              <h3 className={styles.assetGroupTitle}>
                {isZh ? kind : ({ "角色": "Characters", "地点": "Locations", "组织": "Organizations", "道具": "Props", "概念": "Concepts" }[kind] || kind)}
                <span className={styles.cardCount}>{items.length}</span>
              </h3>
              <ul className={styles.list}>
                {items.map((a) => (
                  <li key={a.id} className={styles.row}>
                    <div className={styles.rowHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <p className={styles.rowTitle}>{a.name}</p>
                        {allAssets.some(other => other.id !== a.id && other.name.trim().toLocaleLowerCase() === a.name.trim().toLocaleLowerCase()) ? <small title={a.id}>#{a.id.slice(-8)}</small> : null}
                        <StatusBadge status={a.status} />
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{a.mainVersion || (isZh ? "暂无主版本" : "No main version")}</span>
                    </div>
                    <p className={styles.rowSummary}>{a.summary}</p>
                    <div className={styles.rowMeta}>
                      <span>{isZh ? "来源：" : "Source: "}{a.source || (isZh ? "未提供" : "Not provided")}</span>
                      {a.usedBy.length > 0 ? (
                        <span>{isZh ? `被 ${a.usedBy.length} 个作品使用` : `Used by ${a.usedBy.length} works`}</span>
                      ) : (
                        <span style={{ color: "rgba(255,209,102,0.7)" }}>{isZh ? "暂无作品使用" : "Not used by any work"}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        {audioAssets.length > 0 ? (
          <section className={styles.audioSection} aria-label={isZh ? "宇宙音频资产" : "Universe audio assets"}>
            <h3 className={styles.assetGroupTitle}>{isZh ? "声音资产" : "Audio assets"} <span className={styles.cardCount}>{audioAssets.length}</span></h3>
            <div className={styles.audioList}>
              {audioAssets.map((audio) => (
                <article className={styles.audioRow} key={audio.id}>
                  <div className={styles.rowHeader}>
                    <p className={styles.rowTitle}>{audio.name}</p>
                    <span className={styles.cardCount}>{audio.role}</span>
                  </div>
                  <audio controls preload="metadata" src={audio.playableUrl} />
                  <div className={styles.rowMeta}>
                    {audio.provider ? <span>{audio.provider}{audio.model ? ` · ${audio.model}` : ""}</span> : null}
                    <span>{isZh ? "播放链接有效至 " : "Playback link valid until "}{new Date(audio.expiresAt).toLocaleTimeString(locale)}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <GuideHint>
          {isZh ? "已确认资产优先继承；草稿需确认后升级；备选仅在明确选择时继承；已停用资产不再继承。" : "Canon assets take priority. Drafts need confirmation; alternatives require explicit selection; deprecated assets are no longer inherited."}
        </GuideHint>
      </div>
    </div>
  );
}
