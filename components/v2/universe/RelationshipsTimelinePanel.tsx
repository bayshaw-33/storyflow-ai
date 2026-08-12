"use client";

// 交付物 7：关系与时间线页
// 关系图（简化 SVG 布局）+ 事件时间线。

import { useMemo } from "react";
import { GitBranch } from "lucide-react";
import type { UniverseBundleV2 } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

// 关系图节点视图模型。
type GraphNode = {
  id: string;
  label: string;
  kind: "character" | "location" | "organization" | "prop" | "concept" | "rule";
  x: number;
  y: number;
};

// 简化布局：把节点按 kind 分组，沿环形分布。
function layoutNodes(bundle: UniverseBundleV2): GraphNode[] {
  const cx = 400;
  const cy = 200;
  const radius = 140;
  // 仅取关系中出现过的实体，避免图过密。
  const entityIds = new Set<string>();
  for (const r of bundle.relationships) {
    entityIds.add(r.fromId);
    entityIds.add(r.toId);
  }
  const items: Array<{ id: string; label: string; kind: GraphNode["kind"] }> = [];
  const lookup: Record<string, { name: string; kind: GraphNode["kind"] }> = {};
  for (const c of bundle.characters) lookup[c.id] = { name: c.name, kind: "character" };
  for (const l of bundle.locations) lookup[l.id] = { name: l.name, kind: "location" };
  for (const o of bundle.organizations) lookup[o.id] = { name: o.name, kind: "organization" };
  for (const p of bundle.props) lookup[p.id] = { name: p.name, kind: "prop" };
  for (const c of bundle.concepts) lookup[c.id] = { name: c.name, kind: "concept" };
  for (const r of bundle.rules) lookup[r.id] = { name: r.name, kind: "rule" };

  for (const id of entityIds) {
    const meta = lookup[id];
    if (meta) items.push({ id, label: meta.name, kind: meta.kind });
  }

  const count = items.length;
  return items.map((item, i) => {
    const angle = (i / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
    return {
      id: item.id,
      label: item.label,
      kind: item.kind,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });
}

const NODE_COLORS: Record<GraphNode["kind"], string> = {
  character: "#6de7df",
  location: "#ffd166",
  organization: "#c792ea",
  prop: "#ff8a8a",
  concept: "#82aaff",
  rule: "#82ca9d",
};

export function RelationshipsTimelinePanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { relationships, timelineEvents } = bundle;
  const nodes = useMemo(() => layoutNodes(bundle), [bundle]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  return (
    <div>
      {/* 关系图 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <GitBranch size={16} />
            关系图
            <span className={styles.cardCount}>{relationships.length} 条关系 · {nodes.length} 个节点</span>
          </h2>
        </div>

        {nodes.length === 0 ? (
          <div className={styles.emptyState}>
            <p className={styles.emptyHint}>尚未建立任何关系。从 Inbox 接受关系类候选后会显示在此。</p>
          </div>
        ) : (
          <>
            <svg className={styles.graphSvg} viewBox="0 0 800 400" preserveAspectRatio="xMidYMid meet">
              {/* 边 */}
              {relationships.map((rel) => {
                const from = nodeById.get(rel.fromId);
                const to = nodeById.get(rel.toId);
                if (!from || !to) return null;
                const midX = (from.x + to.x) / 2;
                const midY = (from.y + to.y) / 2 - 8;
                return (
                  <g key={rel.id}>
                    <line
                      className={styles.graphEdge}
                      x1={from.x}
                      y1={from.y}
                      x2={to.x}
                      y2={to.y}
                    />
                    <text className={styles.graphEdgeLabel} x={midX} y={midY}>
                      {rel.type}
                    </text>
                  </g>
                );
              })}
              {/* 节点 */}
              {nodes.map((node) => (
                <g key={node.id} className={styles.graphNode}>
                  <circle
                    className={styles.graphNodeCircle}
                    cx={node.x}
                    cy={node.y}
                    r={28}
                    style={{ stroke: NODE_COLORS[node.kind] }}
                  />
                  <text className={styles.graphNodeLabel} x={node.x} y={node.y + 4}>
                    {node.label.length > 8 ? node.label.slice(0, 7) + "…" : node.label}
                  </text>
                  <text
                    x={node.x}
                    y={node.y + 44}
                    style={{ fill: NODE_COLORS[node.kind], fontSize: 9, textAnchor: "middle" }}
                  >
                    {node.kind}
                  </text>
                </g>
              ))}
            </svg>

            {/* 图例 */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12, fontSize: 11 }}>
              {Object.entries(NODE_COLORS).map(([kind, color]) => (
                <span key={kind} style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.7)" }}>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 999, background: color }} />
                  {kind}
                </span>
              ))}
            </div>
          </>
        )}

        {/* 关系列表 */}
        <div style={{ marginTop: 16 }}>
          <h3 className={styles.sectionTitle}>关系详情</h3>
          <ul className={styles.list}>
            {relationships.map((rel) => {
              const fromNode = nodeById.get(rel.fromId);
              const toNode = nodeById.get(rel.toId);
              return (
                <li key={rel.id} className={styles.row}>
                  <div className={styles.rowHeader}>
                    <p className={styles.rowTitle}>
                      {fromNode?.label ?? rel.fromId}
                      <span style={{ color: "#6de7df", margin: "0 6px" }}>—[{rel.type}]→</span>
                      {toNode?.label ?? rel.toId}
                    </p>
                  </div>
                  <p className={styles.rowSummary}>{rel.description}</p>
                  {rel.history ? (
                    <div className={styles.rowMeta}>
                      <span>历史：{rel.history}</span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <GuideHint>
          关系图为简化环形布局，仅展示已建立的关系。完整关系网络可在 1.0 视图的 CharacterGraph 中查看。
        </GuideHint>
      </div>

      {/* 时间线 */}
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            事件时间线
            <span className={styles.cardCount}>{timelineEvents.length} 个事件</span>
          </h2>
        </div>
        <div className={styles.timeline}>
          {timelineEvents.map((evt) => (
            <div key={evt.id} className={styles.timelineItem}>
              <p className={styles.timelineWhen}>{evt.when}</p>
              <p className={styles.timelineName}>{evt.name}</p>
              <p className={styles.timelineDesc}>{evt.description}</p>
              {evt.involvedEntities.length > 0 ? (
                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {evt.involvedEntities.map((id) => {
                    const node = nodeById.get(id);
                    return (
                      <span key={id} className={styles.impactChip}>
                        {node?.label ?? id}
                      </span>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
