/**
 * P1-04：演员同名去重（纯函数，无 @/ 别名依赖，可进 node 测试）。
 *
 * 重复导入/种子数据会产生同名行（如 13 张同名卡）；按 name 归一化
 * （大小写/空白不敏感）保留 updated_at 最新的一条。
 */
export function dedupeActorsByName<T extends { id: string; name: string; updated_at?: string | null }>(actors: T[]): T[] {
  const byName = new Map<string, T>();
  for (const actor of actors) {
    const key = normalizeActorName(actor.name);
    const existing = byName.get(key);
    if (!existing || timestampOf(actor) > timestampOf(existing)) {
      byName.set(key, actor);
    }
  }
  return [...byName.values()];
}

/**
 * Personal actor records are authored objects, so equal display names do not
 * make them duplicates. Only shared rows keep the seed/import dedupe rule.
 */
export function selectActorsForLibrary<
  T extends { id: string; owner_id: string; name: string; updated_at?: string | null },
>(actors: T[], currentUserId: string): T[] {
  const owned = actors.filter((actor) => actor.owner_id === currentUserId);
  const shared = actors.filter((actor) => actor.owner_id !== currentUserId);
  return [...owned, ...dedupeActorsByName(shared)];
}

function normalizeActorName(name: string): string {
  return name.trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

function timestampOf(actor: { updated_at?: string | null }): number {
  const parsed = Date.parse(actor.updated_at ?? "");
  return Number.isNaN(parsed) ? 0 : parsed;
}
