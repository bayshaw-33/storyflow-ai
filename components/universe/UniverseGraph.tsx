"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DesignAssetImage } from "@/components/design/DesignAssetImage";
import { devStore, DEV } from "@/lib/dev/trace";
import type { GraphNode, UniverseGraph as UniverseGraphData } from "@/lib/universe/graph";

type UniverseGraphProps = {
  graph: UniverseGraphData;
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

type UniverseNodeButtonProps = {
  node: GraphNode;
  active: boolean;
  onActivate: (node: GraphNode) => void;
  onHover: (id: string) => void;
};

const UniverseNodeButton = memo(function UniverseNodeButton({
  node,
  active,
  onActivate,
  onHover,
}: UniverseNodeButtonProps) {
  const handleClick = useCallback(() => onActivate(node), [node, onActivate]);
  const handleMouseEnter = useCallback(() => onHover(node.id), [node.id, onHover]);

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
    </button>
  );
});

export const UniverseGraph = memo(function UniverseGraph({ graph }: UniverseGraphProps) {
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

  return (
    <div className="universe-graph" role="application" aria-label="Universe story graph">
      <DesignAssetImage
        className="universe-bg universe-bg-map"
        token="UNIVERSE_MAP"
        alt=""
        aria-hidden="true"
        draggable={false}
      />
      <DesignAssetImage
        className="universe-bg universe-bg-texture"
        token="UNIVERSE_TEXTURE"
        alt=""
        aria-hidden="true"
        draggable={false}
      />

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

      {visibleNodes.map((node) => (
        <UniverseNodeButton
          key={node.id}
          node={node}
          active={activeId === node.id}
          onActivate={activate}
          onHover={scheduleHover}
        />
      ))}

    </div>
  );
});
