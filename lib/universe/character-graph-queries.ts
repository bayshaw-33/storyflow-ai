/**
 * Character Graph 查询与写入（TRAE-V2-01）
 *
 * 所有函数接收服务端 SupabaseClient（service-role，绕过 RLS）。
 * 调用方负责所有者校验（通过 getUniverseOwnership）。
 *
 * 数据来源：
 * - 节点：storyflow_universe_entities WHERE type='character'
 * - 边：storyflow_universe_relationships
 *
 * 设计文档：Kiikis-V2.0-TRAE-80%-执行PRD.md §TRAE-V2-01
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CanonStatus } from "@/lib/universe";

// ============================================================
// 类型
// ============================================================

export type CharacterNode = {
  id: string;
  name: string;
  summary: string;
  details_json: Record<string, unknown>;
  status: CanonStatus;
  tags: string[];
  updated_at: string;
};

export type CharacterEdge = {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  relationship_status: string;
  summary: string;
  status: CanonStatus;
  updated_at: string;
};

export type CharacterGraphData = {
  nodes: CharacterNode[];
  edges: CharacterEdge[];
};

export type RelationshipInput = {
  source_entity_id: string;
  target_entity_id: string;
  relationship_type?: string;
  relationship_status?: string;
  summary?: string;
  status?: CanonStatus;
};

export type RelationshipUpdate = {
  relationship_type?: string;
  relationship_status?: string;
  summary?: string;
  status?: CanonStatus;
};

// ============================================================
// 读取
// ============================================================

/**
 * 获取宇宙的 Character Graph 数据。
 * 只返回 type='character' 的实体，以及 source/target 都不为 null 的关系。
 */
export async function fetchCharacterGraph(
  serverClient: SupabaseClient,
  universeId: string,
): Promise<CharacterGraphData> {
  const [nodesRes, edgesRes] = await Promise.all([
    serverClient
      .from("storyflow_universe_entities")
      .select("id, name, summary, details_json, status, tags, updated_at")
      .eq("universe_id", universeId)
      .eq("type", "character")
      .order("updated_at", { ascending: false }),
    serverClient
      .from("storyflow_universe_relationships")
      .select(
        "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
      )
      .eq("universe_id", universeId)
      .not("source_entity_id", "is", null)
      .not("target_entity_id", "is", null)
      .order("updated_at", { ascending: false }),
  ]);

  if (nodesRes.error) throw nodesRes.error;
  if (edgesRes.error) throw edgesRes.error;

  return {
    nodes: (nodesRes.data as CharacterNode[]) ?? [],
    edges: (edgesRes.data as CharacterEdge[]) ?? [],
  };
}

// ============================================================
// 写入
// ============================================================

/**
 * 校验关系参数：source/target 必须属于同一 universe、禁止自指。
 */
async function validateRelationshipEntities(
  serverClient: SupabaseClient,
  universeId: string,
  sourceEntityId: string,
  targetEntityId: string,
): Promise<void> {
  if (!sourceEntityId || !targetEntityId) {
    throw new Error("RELATIONSHIP_MISSING_ENDPOINT");
  }
  if (sourceEntityId === targetEntityId) {
    throw new Error("RELATIONSHIP_SELF_REFERENCE");
  }

  const { data, error } = await serverClient
    .from("storyflow_universe_entities")
    .select("id, universe_id, type")
    .in("id", [sourceEntityId, targetEntityId])
    .eq("universe_id", universeId)
    .eq("type", "character");

  if (error) throw error;
  if (!data || data.length !== 2) {
    throw new Error("RELATIONSHIP_ENTITY_NOT_FOUND");
  }
}

/**
 * 新建关系。同一 source+target+type 的关系幂等（已存在则返回现有）。
 */
export async function createRelationship(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
  input: RelationshipInput,
): Promise<CharacterEdge> {
  await validateRelationshipEntities(
    serverClient,
    universeId,
    input.source_entity_id,
    input.target_entity_id,
  );

  const relationshipType = input.relationship_type?.trim() || "related";
  const relationshipStatus = input.relationship_status?.trim() || "active";
  const status: CanonStatus = input.status || "canon";
  const summary = input.summary?.trim() || "";

  // 幂等检查：同一 source+target+type 已存在则返回现有
  const { data: existing, error: findErr } = await serverClient
    .from("storyflow_universe_relationships")
    .select(
      "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
    )
    .eq("universe_id", universeId)
    .eq("source_entity_id", input.source_entity_id)
    .eq("target_entity_id", input.target_entity_id)
    .eq("relationship_type", relationshipType)
    .maybeSingle();

  if (findErr) throw findErr;
  if (existing) return existing as CharacterEdge;

  const newRow = {
    universe_id: universeId,
    user_id: ownerId,
    source_entity_id: input.source_entity_id,
    target_entity_id: input.target_entity_id,
    relationship_type: relationshipType,
    relationship_status: relationshipStatus,
    summary,
    status,
  };

  const { data, error } = await serverClient
    .from("storyflow_universe_relationships")
    .insert(newRow)
    .select(
      "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
    )
    .single();

  if (error) throw error;
  return data as CharacterEdge;
}

/**
 * 更新关系。校验所有者后部分更新。
 */
export async function updateRelationship(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
  relationshipId: string,
  update: RelationshipUpdate,
): Promise<CharacterEdge> {
  // 校验关系存在且属于该 universe
  const { data: existing, error: findErr } = await serverClient
    .from("storyflow_universe_relationships")
    .select("id, universe_id, user_id")
    .eq("id", relationshipId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!existing) throw new Error("RELATIONSHIP_NOT_FOUND");
  if (existing.universe_id !== universeId) throw new Error("RELATIONSHIP_NOT_FOUND");

  const patch: Record<string, unknown> = {};
  if (update.relationship_type !== undefined) {
    patch.relationship_type = update.relationship_type.trim() || "related";
  }
  if (update.relationship_status !== undefined) {
    patch.relationship_status = update.relationship_status.trim() || "active";
  }
  if (update.summary !== undefined) {
    patch.summary = update.summary.trim();
  }
  if (update.status !== undefined) {
    patch.status = update.status;
  }

  if (Object.keys(patch).length === 0) {
    // 无更新，返回现有
    const { data: current, error: curErr } = await serverClient
      .from("storyflow_universe_relationships")
      .select(
        "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
      )
      .eq("id", relationshipId)
      .single();
    if (curErr) throw curErr;
    return current as CharacterEdge;
  }

  const { data, error } = await serverClient
    .from("storyflow_universe_relationships")
    .update(patch)
    .eq("id", relationshipId)
    .select(
      "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
    )
    .single();

  if (error) throw error;
  return data as CharacterEdge;
}

/**
 * 废弃关系（DELETE 的产品语义）。默认改为 deprecated，不物理删除。
 * 仅当关系为新建草稿（无 history）时允许物理删除。
 */
export async function deprecateRelationship(
  serverClient: SupabaseClient,
  universeId: string,
  ownerId: string,
  relationshipId: string,
): Promise<{ deprecated: boolean; relationship: CharacterEdge | null }> {
  const { data: existing, error: findErr } = await serverClient
    .from("storyflow_universe_relationships")
    .select("id, universe_id, status, history_json")
    .eq("id", relationshipId)
    .maybeSingle();

  if (findErr) throw findErr;
  if (!existing) throw new Error("RELATIONSHIP_NOT_FOUND");
  if (existing.universe_id !== universeId) throw new Error("RELATIONSHIP_NOT_FOUND");

  // 已是 deprecated，直接返回
  if (existing.status === "deprecated") {
    const { data: current } = await serverClient
      .from("storyflow_universe_relationships")
      .select(
        "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
      )
      .eq("id", relationshipId)
      .single();
    return { deprecated: true, relationship: (current as CharacterEdge) ?? null };
  }

  // 标记为 deprecated
  const { data, error } = await serverClient
    .from("storyflow_universe_relationships")
    .update({ status: "deprecated" })
    .eq("id", relationshipId)
    .select(
      "id, source_entity_id, target_entity_id, relationship_type, relationship_status, summary, status, updated_at",
    )
    .single();

  if (error) throw error;
  return { deprecated: true, relationship: data as CharacterEdge };
}
