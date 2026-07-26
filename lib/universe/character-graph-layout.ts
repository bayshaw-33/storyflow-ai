/**
 * Character Graph 布局算法（TRAE-V2-01）
 *
 * 使用确定性黄金角螺旋散布（golden-angle spiral），
 * 让节点在 0-100 的百分比坐标系内自然分布。
 */

export type LayoutNode = {
  id: string;
  x: number;
  y: number;
};

export type LayoutResult = {
  nodes: Map<string, LayoutNode>;
};

const GOLDEN_ANGLE = 137.508 * (Math.PI / 180);

function clampPct(value: number): number {
  return Math.max(6, Math.min(94, value));
}

/**
 * 计算节点的确定性散布位置。
 * 同一组输入始终产生相同输出（便于 SSR/CSR 一致性）。
 */
export function computeCharacterLayout(
  nodeIds: string[],
  edges: Array<{ source_entity_id: string; target_entity_id: string }>,
): LayoutResult {
  const total = nodeIds.length;
  const nodes = new Map<string, LayoutNode>();

  if (total === 0) return { nodes };

  // 按关系密度排序：有关系的节点优先放在中心附近
  const degreeMap = new Map<string, number>();
  for (const id of nodeIds) degreeMap.set(id, 0);
  for (const edge of edges) {
    degreeMap.set(edge.source_entity_id, (degreeMap.get(edge.source_entity_id) ?? 0) + 1);
    degreeMap.set(edge.target_entity_id, (degreeMap.get(edge.target_entity_id) ?? 0) + 1);
  }

  const sortedIds = [...nodeIds].sort((a, b) => {
    const degA = degreeMap.get(a) ?? 0;
    const degB = degreeMap.get(b) ?? 0;
    return degB - degA;
  });

  const baseRadius = total <= 5 ? 12 : total <= 20 ? 20 : total <= 50 ? 28 : 36;
  const radiusGrowth = total <= 5 ? 18 : total <= 20 ? 24 : 32;

  sortedIds.forEach((id, index) => {
    const radius = baseRadius + (index / Math.max(total, 1)) * radiusGrowth;
    const angle = index * GOLDEN_ANGLE;
    const x = 50 + Math.cos(angle) * radius * 1.35;
    const y = 48 + Math.sin(angle) * radius;
    nodes.set(id, { id, x: clampPct(x), y: clampPct(y) });
  });

  return { nodes };
}

/**
 * 聚焦某个节点时，返回其一度邻居的 id 集合（含自身）。
 */
export function getNeighbors(
  nodeId: string,
  edges: Array<{ source_entity_id: string; target_entity_id: string }>,
): Set<string> {
  const neighbors = new Set<string>([nodeId]);
  for (const edge of edges) {
    if (edge.source_entity_id === nodeId) {
      neighbors.add(edge.target_entity_id);
    } else if (edge.target_entity_id === nodeId) {
      neighbors.add(edge.source_entity_id);
    }
  }
  return neighbors;
}
