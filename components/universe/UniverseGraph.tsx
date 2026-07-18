"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { devStore, DEV } from "@/lib/dev/trace";
import type { GraphNode, UniverseGraph as UniverseGraphData } from "@/lib/universe/graph";

/**
 * PRD §5.4 关系图：作为第二种浏览方式，不独占首屏。
 * 节点显示 Universe 名称、作品数和角色数。
 * 点击进详情；详情返回时恢复视图和滚动位置（由列表页通过 sessionStorage 处理）。
 * 无数据显示明确空状态。
 */

export type UniverseGraphSummary = {
  workCount?: number;
  characterCount?: number;
};

type UniverseGraphProps = {
  graph: UniverseGraphData;
  height?: number;
  /** universeId -> 摘要；用于在 world 节点上叠加作品数/角色数 */
  summaries?: Record<string, UniverseGraphSummary>;
  /** 空状态文案 */
  emptyLabel?: string;
};

const MAX_VISIBLE_NODES = 48;
const CULL_MARGIN = 12;

function isNodeInViewport(node: GraphNode): boolean {
  return (
    node.x >= -CULL_MARGIN &&
    node.x <= 100 + CULL_MARGIN &&
    node.y >= -CULL_MARGIN &&
    node.y <= 100 + CULL_MARGIN
  );
}

/** 从 node.id（形如 "world-<universeId>"）解析出 universeId；非 world 节点返回 null。 */
function universeIdFromNode(node: GraphNode): string | null {
  if (node.type !== "world") return null;
  const prefix = "world-";
  return node.id.startsWith(prefix) ? node.id.slice(prefix.length) : null;
}

type UniverseNodeButtonProps = {
  node: GraphNode;
  active: boolean;
  summary?: UniverseGraphSummary;
  onActivate: (node: GraphNode) => void;
  onHover: (id: string) => void;
};

const UniverseNodeButton = memo(function UniverseNodeButton({
  node,
  active,
  summary,
  onActivate,
  onHover,
}: UniverseNodeButtonProps) {
  const handleClick = useCallback(() => onActivate(node), [node, onActivate]);
  const handleMouseEnter = useCallback(() => onHover(node.id), [node.id, onHover]);

  const meta = summary && (summary.workCount != null || summary.characterCount != null)
    ? `${summary.workCount ?? 0}w · ${summary.characterCount ?? 0}c`
    : null;

  return (
    <button
      type="button"
      className={`universe-node node-${node.type}${active ? " is-active" : ""}`}
      data-node-type={node.type}
      style={{ left: `${node.x}%`, top: `${node.y}%`, ["--node-scale" as string]: node.scale }}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
    >
      <DesignAssetImage token={node.asset} alt="" aria-hidden="true" draggable={false} />
      {node.label ? <span className="universe-node-label">{node.label}</span> : null}
      {meta ? <span className="universe-node-meta" aria-hidden="true">{meta}</span> : null}
    </button>
  );
});

export const UniverseGraph = memo(function UniverseGraph({ graph, height, summaries, emptyLabel }: UniverseGraphProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const pendingHoverId = useRef<string | null>(null);

  const visibleNodes = useMemo(
    () => graph.nodes.filter(isNodeInViewport).slice(0, MAX_VISIBLE_NODES),
    [graph.nodes],
  );

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);

  const byId = useMemo(
    () => new Map(visibleNodes.map((node) => [node.id, node] as const)),
    [visibleNodes],
  );

  const visibleEdges = useMemo(
    () =>
      graph.edges.filter(
        (edge) => visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to),
      ),
    [graph.edges, visibleNodeIds],
  );

  // PRD §5.4 无数据显示明确空状态
  const hasWorldNodes = useMemo(() => graph.nodes.some((node) => node.type === "world"), [graph.nodes]);

  useEffect(() => {
    return () => {
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    };
  }, []);

  // publish graph size into the dev debug store (observability)
  useEffect(() => {
    if (DEV) devStore().universeNodeCount = graph.nodes.length;
  }, [graph.nodes.length]);

  const scheduleHover = useCallback((id: string) => {
    pendingHoverId.current = id;
    if (hoverFrame.current !== null) return;

    hoverFrame.current = requestAnimationFrame(() => {
      hoverFrame.current = null;
      const next = pendingHoverId.current;
      pendingHoverId.current = null;
      if (next) setActiveId((current) => (current === next ? current : next));
    });
  }, []);

  const activate = useCallback(
    (node: GraphNode) => {
      setActiveId((current) => (current === node.id ? current : node.id));
      if (node.href) router.push(node.href);
    },
    [router],
  );

  if (!hasWorldNodes && emptyLabel) {
    return (
      <div
        className="universe-graph universe-graph-empty"
        style={height ? { height, display: "grid", placeItems: "center" } : { display: "grid", placeItems: "center", minHeight: 240 }}
        role="application"
        aria-label="Universe story graph"
      >
        <p style={{ margin: 0, padding: 24, textAlign: "center", color: "rgba(255,255,255,0.6)", fontSize: 13 }}>
          {emptyLabel}
        </p>
      </div>
    );
  }

  return (
    <div
      className="universe-graph"
      style={height ? { height } : undefined}
      role="application"
      aria-label="Universe story graph"
    >
      <svg className="universe-edges" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {visibleEdges.map((edge) => {
          const from = byId.get(edge.from);
          const to = byId.get(edge.to);
          if (!from || !to) return null;
          return (
            <line
              key={`${edge.from}-${edge.to}`}
              className={`universe-edge edge-${edge.type}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
            />
          );
        })}
      </svg>

      {visibleNodes.map((node) => {
        const universeId = universeIdFromNode(node);
        const summary = universeId && summaries ? summaries[universeId] : undefined;
        return (
          <UniverseNodeButton
            key={node.id}
            node={node}
            active={activeId === node.id}
            summary={summary}
            onActivate={activate}
            onHover={scheduleHover}
          />
        );
      })}

    </div>
  );
});
