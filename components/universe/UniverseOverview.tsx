"use client";

import Link from "next/link";
import { useState } from "react";
import { BookOpen, X, AlertTriangle } from "lucide-react";
import {
  getUniverseCopy,
  formatUpdatedAt,
  type UniverseOverviewData,
} from "./universe-view-model";
import styles from "./universe.module.css";

type UniverseOverviewProps = {
  overview: UniverseOverviewData;
  isZh: boolean;
};

/**
 * PRD §6.1 概览区。
 * universe 封面 + cardSummary + 类型/语言/市场 + 计数 + 代表实体缩略图 +
 * 最近更新 + pending 提醒 + 关联作品预览 + "查看完整 Universe Bible" 入口。
 * 禁止把完整 description 渲染为 <h2>；完整 description 走独立阅读抽屉。
 */
export function UniverseOverview({ overview, isZh }: UniverseOverviewProps) {
  const copy = getUniverseCopy(isZh);
  const [bibleOpen, setBibleOpen] = useState(false);

  const { universe, counts, representativeEntities, recentChanges, pendingItems, canonConflicts, works } = overview;
  const initial = (universe.name.trim()[0] || "·").toUpperCase();
  const pendingCount = counts.pendingInbox;

  return (
    <div className={styles.overviewGrid}>
      <div>
        <div className={styles.overviewCover}>
          <div className={styles.overviewCoverPlaceholder} aria-hidden="true">{initial}</div>
        </div>

        <div className={styles.panel}>
          <p className={styles.panelKicker}>{copy.detail.overview}</p>
          <h2 className={styles.panelTitle}>{universe.name}</h2>
          {universe.cardSummary ? (
            <p className={styles.panelBody}>{universe.cardSummary}</p>
          ) : null}
          <div className={styles.metaRow}>
            {universe.genre ? <span className={styles.metaChip}>{copy.detail.genre}: {universe.genre}</span> : null}
            {universe.defaultLanguage ? <span className={styles.metaChip}>{copy.detail.language}: {universe.defaultLanguage}</span> : null}
            {universe.targetMarkets.length ? <span className={styles.metaChip}>{copy.detail.markets}: {universe.targetMarkets.join(", ")}</span> : null}
            {universe.tone ? <span className={styles.metaChip}>{copy.detail.tone}: {universe.tone}</span> : null}
          </div>
          <button type="button" className={styles.bibleButton} onClick={() => setBibleOpen(true)}>
            <BookOpen size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
            {copy.detail.bibleOpen}
          </button>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className={styles.panel}>
          <p className={styles.panelKicker}>{copy.detail.counts}</p>
          <div className={styles.countsGrid}>
            <CountCell value={counts.characters} label={isZh ? "角色" : "Cast"} />
            <CountCell value={counts.locations} label={isZh ? "地点" : "Locales"} />
            <CountCell value={counts.props} label={isZh ? "道具" : "Props"} />
            <CountCell value={counts.organizations} label={isZh ? "组织" : "Orgs"} />
            <CountCell value={counts.works} label={isZh ? "作品" : "Works"} />
            <CountCell value={counts.canonFacts} label={isZh ? "事实" : "Facts"} />
            <CountCell value={counts.relationships} label={isZh ? "关系" : "Rel."} />
            <CountCell value={counts.timeline} label={isZh ? "时间线" : "Timeline"} />
            <CountCell value={counts.pendingInbox} label="Inbox" />
          </div>
          {canonConflicts > 0 ? (
            <span className={styles.canonConflictPill}>
              <AlertTriangle size={12} />
              {copy.detail.canonConflicts}: {canonConflicts}
            </span>
          ) : null}
        </div>

        {pendingCount > 0 ? (
          <div className={styles.pendingReminder}>
            <AlertTriangle size={14} />
            {isZh
              ? `有 ${pendingCount} 条 Inbox 候选项等待你审核。`
              : `${pendingCount} Inbox candidate(s) waiting for your review.`}
          </div>
        ) : null}

        {representativeEntities.length ? (
          <div className={styles.panel}>
            <p className={styles.panelKicker}>{copy.detail.representatives}</p>
            <div className={styles.repGrid}>
              {representativeEntities.map((entity) => (
                <div key={entity.id} className={styles.repCard}>
                  <div className={styles.repThumb}>
                    {entity.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={entity.thumbnail} alt={entity.name} loading="lazy" />
                    ) : (
                      (entity.name.trim()[0] || "·").toUpperCase()
                    )}
                  </div>
                  <span className={styles.repName}>{entity.name}</span>
                  <span className={styles.repType}>{entity.type}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.panel}>
            <p className={styles.panelKicker}>{copy.detail.representatives}</p>
            <p className={styles.panelBody}>{copy.detail.noRepresentatives}</p>
          </div>
        )}

        {recentChanges.length ? (
          <div className={styles.panel}>
            <p className={styles.panelKicker}>{copy.detail.recentChanges}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {recentChanges.map((change) => (
                <div key={change.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12.5 }}>
                  <span style={{ color: "#d8dee0" }}>
                    <span style={{ color: "#6de7df", marginRight: 6 }}>{change.type}</span>
                    {change.name}
                  </span>
                  <span style={{ color: "#8f999b" }}>{formatUpdatedAt(change.updatedAt, isZh)}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {works.length ? (
          <div className={styles.panel}>
            <p className={styles.panelKicker}>{copy.detail.worksPreview}</p>
            <div className={styles.worksPreview}>
              {works.map((work) => (
                <Link key={work.id} href={`/universes/${universe.id}?tab=works`} className={styles.workPreviewRow}>
                  <span className={styles.workPreviewRole}>{work.projectRole}</span>
                  <span className={styles.workPreviewTitle}>{work.title}</span>
                  <span style={{ fontSize: 11, color: "#8f999b" }}>{formatUpdatedAt(work.updatedAt, isZh)}</span>
                </Link>
              ))}
            </div>
          </div>
        ) : null}

        {pendingItems.length ? (
          <div className={styles.panel}>
            <p className={styles.panelKicker}>{copy.detail.pendingReminder}</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {pendingItems.map((item) => (
                <div key={item.id} style={{ fontSize: 12.5, color: "#d8dee0" }}>
                  <span style={{ color: "#ffca28", marginRight: 6 }}>{item.type}</span>
                  {item.summary}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {bibleOpen ? (
        <div className={styles.bibleDrawer} role="dialog" aria-modal="true">
          <div className={styles.bibleBackdrop} onClick={() => setBibleOpen(false)} />
          <div className={styles.biblePanel}>
            <div className={styles.bibleHeader}>
              <div>
                <p className={styles.panelKicker}>{copy.detail.bible}</p>
                <h2 className={styles.panelTitle}>{universe.name}</h2>
              </div>
              <button type="button" className={styles.iconButton} aria-label={copy.detail.bibleClose} onClick={() => setBibleOpen(false)}>
                <X size={16} />
              </button>
            </div>
            <div className={styles.bibleContent}>
              {universe.description || universe.cardSummary || (isZh ? "暂无完整 Bible 内容。" : "No full Bible content yet.")}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CountCell({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.countCell}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}
