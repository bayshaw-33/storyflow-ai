"use client";

import { useMemo, useState } from "react";
import { getUniverseEntityThumbnail, type UniverseEntity, type UniverseProjectLink } from "@/lib/universe";
import { getUniverseCopy, formatUpdatedAt, sanitizeCardSummary } from "./universe-view-model";
import styles from "./universe.module.css";

type AssetFilter = "all" | "character" | "location" | "object" | "organization";

type UniverseAssetsProps = {
  entities: UniverseEntity[];
  links: UniverseProjectLink[];
  projectsById: Map<string, { id: string; title: string }>;
  isZh: boolean;
};

/**
 * PRD §6.2 资产区。二级筛选（全部/角色/地点/道具/组织）。
 * 资产卡展示主缩略图/名称/一句话摘要/Canon-Draft-Alternative 状态/
 * 被多少作品使用/来源作品/更新时间。
 * 无图资产显示类型化占位图 + "生成形象"按钮（端点未接通时禁用态）。
 */
export function UniverseAssets({ entities, links, projectsById, isZh }: UniverseAssetsProps) {
  const copy = getUniverseCopy(isZh);
  const [filter, setFilter] = useState<AssetFilter>("all");

  const counts = useMemo(() => {
    const next: Record<AssetFilter, number> = { all: entities.length, character: 0, location: 0, object: 0, organization: 0 };
    for (const entity of entities) {
      if (entity.type === "character") next.character += 1;
      else if (entity.type === "location") next.location += 1;
      else if (entity.type === "object") next.object += 1;
      else if (entity.type === "organization") next.organization += 1;
    }
    return next;
  }, [entities]);

  const filtered = useMemo(() => {
    if (filter === "all") return entities;
    return entities.filter((entity) => entity.type === filter);
  }, [entities, filter]);

  const linkProjectIds = useMemo(() => new Set(links.map((link) => link.project_id)), [links]);

  const filters: Array<{ key: AssetFilter; label: string; count: number }> = [
    { key: "all", label: copy.assets.all, count: counts.all },
    { key: "character", label: copy.assets.character, count: counts.character },
    { key: "location", label: copy.assets.location, count: counts.location },
    { key: "object", label: copy.assets.object, count: counts.object },
    { key: "organization", label: copy.assets.organization, count: counts.organization },
  ];

  return (
    <div>
      <div className={styles.subFilter} role="tablist">
        {filters.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={filter === item.key}
            className={filter === item.key ? "active" : ""}
            onClick={() => setFilter(item.key)}
            type="button"
          >
            {item.label}
            <span className={styles.tabCount}>{item.count}</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyState}>
          <strong>{copy.assets.empty}</strong>
        </div>
      ) : (
        <div className={styles.assetGrid}>
          {filtered.map((entity) => {
            const thumbnail = getUniverseEntityThumbnail(entity);
            const sourceProject = entity.source_project_id ? projectsById.get(entity.source_project_id) : null;
            const usedByWorks = entity.source_project_id && linkProjectIds.has(entity.source_project_id) ? 1 : 0;
            const initial = (entity.name.trim()[0] || "·").toUpperCase();
            return (
              <article key={entity.id} className={styles.assetCard}>
                <div className={styles.assetThumb}>
                  {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbnail} alt={entity.name} loading="lazy" />
                  ) : (
                    <span>{initial}</span>
                  )}
                </div>
                <div className={styles.assetBody}>
                  <span className={`${styles.statusChip} ${styles[entity.status] || styles.draft}`}>
                    {entity.status}
                  </span>
                  <h3 className={styles.assetName}>{entity.name}</h3>
                  <p className={styles.assetSummary}>{sanitizeCardSummary(entity.summary) || copy.card.noSummary}</p>
                  <div className={styles.assetMeta}>
                    <span>{copy.assets.usedBy}: {usedByWorks}</span>
                    <span>{copy.assets.source}: {sourceProject?.title || entity.source_project_id || "—"}</span>
                    <span>{copy.assets.updated}: {formatUpdatedAt(entity.updated_at, isZh)}</span>
                  </div>
                  {!thumbnail ? (
                    <div className={styles.assetActions}>
                      <button type="button" className={styles.disabledButton} disabled title={copy.assets.generateHint}>
                        {copy.assets.generate}
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
