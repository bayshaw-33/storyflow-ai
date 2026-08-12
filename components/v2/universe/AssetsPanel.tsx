"use client";

// 交付物 3：资产页
// 角色 / 地点 / 组织 / 道具 / 概念列表，每个对象显示状态、来源、主版本、被使用情况。

import { useMemo, useState } from "react";
import { Boxes, Search } from "lucide-react";
import type { UniverseBundleV2, UniverseObjectStatus } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { StatusBadge, GuideHint } from "./shared";

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

const STATUS_FILTERS: Array<{ value: "all" | UniverseObjectStatus; label: string }> = [
  { value: "all", label: "全部" },
  { value: "canon", label: "Canon" },
  { value: "draft", label: "Draft" },
  { value: "alternative", label: "Alternative" },
  { value: "deprecated", label: "Deprecated" },
];

export function AssetsPanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | UniverseObjectStatus>("all");

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
            资产总览
            <span className={styles.cardCount}>共 {allAssets.length} 项</span>
          </h2>
        </div>

        <div className={styles.toolbar}>
          <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
            <Search size={14} style={{ position: "absolute", left: 10, top: 9, color: "rgba(255,255,255,0.4)" }} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索资产名称或摘要…"
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | UniverseObjectStatus)}
            className={styles.button}
            style={{ padding: "8px 10px" }}
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value} style={{ background: "#070808" }}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {grouped.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyHint}>没有匹配的资产。试试调整搜索词或状态筛选。</p>
          </div>
        ) : (
          grouped.map(([kind, items]) => (
            <div key={kind} className={styles.assetGroup}>
              <h3 className={styles.assetGroupTitle}>
                {kind}
                <span className={styles.cardCount}>{items.length}</span>
              </h3>
              <ul className={styles.list}>
                {items.map((a) => (
                  <li key={a.id} className={styles.row}>
                    <div className={styles.rowHeader}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <p className={styles.rowTitle}>{a.name}</p>
                        <StatusBadge status={a.status} />
                      </div>
                      <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{a.mainVersion}</span>
                    </div>
                    <p className={styles.rowSummary}>{a.summary}</p>
                    <div className={styles.rowMeta}>
                      <span>来源：{a.source}</span>
                      {a.usedBy.length > 0 ? (
                        <span>被 {a.usedBy.length} 个作品使用</span>
                      ) : (
                        <span style={{ color: "rgba(255,209,102,0.7)" }}>暂无作品使用</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}

        <GuideHint>
          每个资产的状态决定其在作品继承中的优先级：Canon 优先继承；Draft 需确认后升级；Alternative 仅在显式选择时继承；Deprecated 不再继承。
        </GuideHint>
      </div>
    </div>
  );
}
