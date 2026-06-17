// KIIKIS UNIVERSE — Graph core.
// Universe is a node graph, not a page. Nodes float in space (x/y are
// percentages of the map surface); edges connect node centres.

import type { AssetToken } from "@/lib/design/manifest";
import type { DramaProject } from "@/lib/projects";

export type NodeType = "flagship" | "world" | "story" | "feature";
export type EdgeType = "relation" | "unlock" | "dependency";

export type GraphNode = {
  id: string;
  type: NodeType;
  asset: AssetToken;
  /** floating position, percentage of the map surface */
  x: number;
  y: number;
  /** relative node scale (1 = base) */
  scale: number;
  /** optional navigation target on click */
  href?: string;
  /** node ids this node connects to */
  connections: string[];
};

export type GraphEdge = {
  from: string;
  to: string;
  type: EdgeType;
};

export type UniverseGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const NODE_ASSET: Record<NodeType, AssetToken> = {
  flagship: "UNIVERSE_FLAGSHIP",
  world: "UNIVERSE_WORLD_CARD",
  story: "UNIVERSE_STORY_NODE",
  feature: "UNIVERSE_EXPLORATION_WIDGET",
};

// Deterministic scatter around the centre (golden-angle spiral) so nodes
// float in space rather than snapping to a grid.
const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);

function scatter(index: number, total: number): { x: number; y: number } {
  const radius = 16 + (index / Math.max(total, 1)) * 30; // 16%..46% out
  const angle = index * GOLDEN_ANGLE;
  return {
    x: 50 + Math.cos(angle) * radius * 1.35, // wider than tall
    y: 48 + Math.sin(angle) * radius,
  };
}

// Fixed feature nodes (exploration widgets) orbiting the flagship.
const FEATURE_NODES: { id: string; x: number; y: number; href?: string }[] = [
  { id: "feature-explore", x: 22, y: 22, href: "/templates" },
  { id: "feature-canon", x: 80, y: 26 },
  { id: "feature-timeline", x: 84, y: 74 },
];

export function buildUniverseGraph(projects: DramaProject[]): UniverseGraph {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  const flagship: GraphNode = {
    id: "flagship",
    type: "flagship",
    asset: NODE_ASSET.flagship,
    x: 50,
    y: 48,
    scale: 1.25,
    href: "/dashboard",
    connections: [],
  };
  nodes.push(flagship);

  // Feature nodes orbit + depend on the flagship core.
  FEATURE_NODES.forEach((feature) => {
    nodes.push({
      id: feature.id,
      type: "feature",
      asset: NODE_ASSET.feature,
      x: feature.x,
      y: feature.y,
      scale: 0.7,
      href: feature.href,
      connections: ["flagship"],
    });
    edges.push({ from: "flagship", to: feature.id, type: "unlock" });
  });

  // Each real project becomes a world node; its first story branches off it.
  projects.forEach((project, index) => {
    const pos = scatter(index, projects.length);
    const worldId = `world-${project.id}`;
    nodes.push({
      id: worldId,
      type: "world",
      asset: NODE_ASSET.world,
      x: clampPct(pos.x),
      y: clampPct(pos.y),
      scale: 0.95,
      href: `/projects/${project.id}`,
      connections: ["flagship"],
    });
    flagship.connections.push(worldId);
    edges.push({ from: "flagship", to: worldId, type: "relation" });

    if (project.finalScript?.trim() || project.characterCards.length > 0) {
      const storyId = `story-${project.id}`;
      nodes.push({
        id: storyId,
        type: "story",
        asset: NODE_ASSET.story,
        x: clampPct(pos.x + 7),
        y: clampPct(pos.y + 9),
        scale: 0.7,
        href: `/projects/${project.id}`,
        connections: [worldId],
      });
      edges.push({ from: worldId, to: storyId, type: "dependency" });
    }
  });

  return { nodes, edges };
}

function clampPct(value: number): number {
  return Math.max(6, Math.min(94, value));
}
