"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Pencil, Archive } from "lucide-react";
import {
  getUniverseCopy,
  formatUpdatedAt,
  sanitizeCardSummary,
  type UniverseListItem,
} from "./universe-view-model";
import styles from "./universe.module.css";

type UniverseCardProps = {
  universe: UniverseListItem;
  isZh: boolean;
  onArchive?: (universe: UniverseListItem) => void;
};

/**
 * PRD §5.3 Universe 卡片。
 * 固定展示：16:9 封面 / 名称 / 状态 / 最多 2 行 cardSummary / 最多 3 个标签 /
 * 作品+角色+地点计数 / Pending Inbox 徽标 / 更新时间。
 * 操作：点击进详情；更多菜单提供编辑摘要、归档；本轮不提供物理删除。
 */
export function UniverseCard({ universe, isZh, onArchive }: UniverseCardProps) {
  const copy = getUniverseCopy(isZh);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handle = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [menuOpen]);

  const isActive = universe.status === "active";
  const summary = sanitizeCardSummary(universe.cardSummary) || copy.card.noSummary;
  const tags = universe.tags.slice(0, 3);
  const initial = (universe.name.trim()[0] || "·").toUpperCase();

  return (
    <Link
      href={`/universes/${universe.id}`}
      className={styles.card}
      aria-label={universe.name}
    >
      <div className={styles.cover}>
        {universe.coverUrl ? (
          // 封面 URL 来自已授权的 universe 资产；不使用 next/image 以避免 loader 配置耦合。
          // eslint-disable-next-line @next/next/no-img-element
          <img src={universe.coverUrl} alt={universe.name} loading="lazy" />
        ) : (
          <div className={styles.coverPlaceholder} aria-hidden="true">{initial}</div>
        )}
        <span className={`${styles.statusPill} ${isActive ? "active" : "archived"}`}>
          {isActive ? copy.card.active : copy.card.archived}
        </span>
        {universe.pendingInboxCount > 0 ? (
          <span className={styles.inboxBadge}>
            {copy.card.inboxBadge} {universe.pendingInboxCount}
          </span>
        ) : null}
      </div>

      <div className={styles.cardBody}>
        <h3 className={styles.cardName}>{universe.name}</h3>
        <p className={styles.cardSummary}>{summary}</p>
        {tags.length ? (
          <div className={styles.tags}>
            {tags.map((tag) => (
              <span key={tag} className={styles.tag}>{tag}</span>
            ))}
          </div>
        ) : null}
      </div>

      <div className={styles.cardFooter}>
        <span className={styles.metric}>
          <strong>{universe.workCount}</strong> {copy.card.works}
        </span>
        <span className={styles.metric}>
          <strong>{universe.characterCount}</strong> {copy.card.characters}
        </span>
        <span className={styles.metric}>
          <strong>{universe.locationCount}</strong> {copy.card.locations}
        </span>
        <span className={styles.spacer} />
        <span className={styles.updatedAt}>{formatUpdatedAt(universe.updatedAt, isZh)}</span>
      </div>

      {onArchive ? (
        <div ref={menuRef}>
          <button
            type="button"
            className={styles.moreButton}
            aria-label={copy.card.more}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen((open) => !open);
            }}
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen ? (
            <div className={styles.moreMenu} role="menu">
              <Link
                href={`/universes/${universe.id}`}
                className={styles.moreMenuItem}
                role="menuitem"
                onClick={(event) => event.stopPropagation()}
              >
                <Pencil size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
                {copy.card.editSummary}
              </Link>
              <button
                type="button"
                className={styles.moreMenuItem}
                role="menuitem"
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenuOpen(false);
                  onArchive(universe);
                }}
              >
                <Archive size={13} style={{ marginRight: 6, verticalAlign: "middle" }} />
                {copy.card.archive}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </Link>
  );
}
