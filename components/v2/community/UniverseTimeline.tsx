import { GitBranch, History, Sparkles } from "lucide-react";
import type { UniverseCommunityTimelineEvent, UniverseCommunityVersion } from "@/lib/contracts/v2/community-universe";
import styles from "@/app/community/community.module.css";

export function UniverseTimeline(props: {
  events: readonly UniverseCommunityTimelineEvent[];
  versions: readonly UniverseCommunityVersion[];
}) {
  return (
    <section className={styles.universePanel} aria-labelledby="universe-timeline-title">
      <div className={styles.universePanelHeader}>
        <div>
          <span className={styles.universePanelKicker}>CONTINUITY</span>
          <h2 id="universe-timeline-title" className={styles.universePanelTitle}>世界时间线与版本</h2>
        </div>
        <History size={18} aria-hidden="true" />
      </div>
      <div className={styles.universeTimelineLayout}>
        <div className={styles.universeTimeline}>
          {props.events.length ? props.events.map((event) => (
            <article className={styles.timelineItem} key={event.id}>
              <span className={styles.timelineDot} aria-hidden="true" />
              <div className={styles.timelineLine}>
                <div className={styles.timelineMeta}><span>{event.dateLabel || "时间未标注"}</span><span className={`${styles.statusPill} ${event.status === "canon" ? styles.statusCanon : styles.statusDraft}`}>{event.status}</span></div>
                <h3>{event.title}</h3>
                {event.description ? <p>{event.description}</p> : null}
              </div>
            </article>
          )) : <p className={styles.universeGroupEmpty}>还没有公开时间线事件。</p>}
        </div>
        <aside className={styles.universeVersionRail}>
          <div className={styles.universeLinkedHeading}><GitBranch size={16} /><strong>Universe 版本</strong></div>
          {props.versions.length ? props.versions.map((version) => (
            <div className={styles.versionItem} key={version.id}>
              <span className={styles.versionNumber}>v{version.versionNo}</span>
              <div><strong>{version.contentHash.slice(0, 12)}</strong><span>{formatDate(version.createdAt)}</span></div>
            </div>
          )) : <p className={styles.universeGroupEmpty}>尚未形成版本记录。</p>}
          <div className={styles.versionHint}><Sparkles size={13} />每次确认后的 Canon 变化都会留下版本。</div>
        </aside>
      </div>
    </section>
  );
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "时间未知" : new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
