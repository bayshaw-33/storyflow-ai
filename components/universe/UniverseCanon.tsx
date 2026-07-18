"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import type {
  CanonFact,
  CanonCheckReport,
  UniverseRelationship,
  UniverseTimelineEvent,
} from "@/lib/universe";
import { getUniverseCopy, formatUpdatedAt } from "./universe-view-model";
import styles from "./universe.module.css";

type CanonFilter = "facts" | "relationships" | "timeline" | "checks";

type UniverseCanonProps = {
  canonFacts: CanonFact[];
  relationships: UniverseRelationship[];
  timeline: UniverseTimelineEvent[];
  reports: CanonCheckReport[];
  isZh: boolean;
};

/**
 * PRD §6.4 Canon 区。二级筛选（事实/关系/时间线/一致性检查）。
 * Canon Check 失败显式显示，不固定分数。
 */
export function UniverseCanon({ canonFacts, relationships, timeline, reports, isZh }: UniverseCanonProps) {
  const copy = getUniverseCopy(isZh);
  const [filter, setFilter] = useState<CanonFilter>("facts");

  const filters: Array<{ key: CanonFilter; label: string; count: number }> = [
    { key: "facts", label: copy.canon.facts, count: canonFacts.length },
    { key: "relationships", label: copy.canon.relationships, count: relationships.length },
    { key: "timeline", label: copy.canon.timeline, count: timeline.length },
    { key: "checks", label: copy.canon.checks, count: reports.length },
  ];

  const failedChecks = useMemo(
    () => reports.filter((report) => report.issues_json.some((issue) => issue.severity === "critical" || issue.severity === "warning")),
    [reports],
  );

  return (
    <div>
      <div className={styles.subFilter} role="tablist">
        {filters.map((item) => (
          <button
            key={item.key}
            role="tab"
            aria-selected={filter === item.key}
            type="button"
            className={filter === item.key ? "active" : ""}
            onClick={() => setFilter(item.key)}
          >
            {item.label}
            <span className={styles.tabCount}>{item.count}</span>
          </button>
        ))}
      </div>

      {filter === "facts" ? (
        <CanonList
          empty={copy.canon.empty}
          items={canonFacts.map((fact) => ({
            id: fact.id,
            meta: `${fact.importance}${fact.is_locked ? ` · ${copy.canon.locked}` : ""}`,
            title: fact.fact_text,
            body: fact.source_location_text || "",
            updatedAt: fact.updated_at,
            tags: fact.is_locked ? [copy.canon.locked] : [],
          }))}
          isZh={isZh}
        />
      ) : null}

      {filter === "relationships" ? (
        <CanonList
          empty={copy.canon.empty}
          items={relationships.map((rel) => ({
            id: rel.id,
            meta: `${rel.relationship_type} · ${rel.status}`,
            title: rel.summary || rel.relationship_type,
            body: "",
            updatedAt: rel.updated_at,
            tags: [],
          }))}
          isZh={isZh}
        />
      ) : null}

      {filter === "timeline" ? (
        <CanonList
          empty={copy.canon.empty}
          items={timeline.map((event) => ({
            id: event.id,
            meta: event.date_label || event.status,
            title: event.title,
            body: event.description,
            updatedAt: event.updated_at,
            tags: event.is_canon ? ["canon"] : [],
          }))}
          isZh={isZh}
        />
      ) : null}

      {filter === "checks" ? (
        <div className={styles.canonList}>
          {reports.length === 0 ? (
            <div className={styles.emptyState}><strong>{copy.canon.empty}</strong></div>
          ) : null}
          {failedChecks.length > 0 ? (
            <div className={`${styles.notice} ${styles.noticeError}`} style={{ margin: "0 0 12px" }}>
              <AlertTriangle size={14} />
              {isZh ? `${failedChecks.length} 份检查报告存在 critical/warning 问题` : `${failedChecks.length} report(s) have critical/warning issues`}
            </div>
          ) : null}
          {reports.map((report) => {
            const issues = report.issues_json || [];
            const hasFailures = issues.some((issue) => issue.severity === "critical" || issue.severity === "warning");
            return (
              <article key={report.id} className={styles.canonRow}>
                <div className={styles.canonRowMeta}>
                  {formatUpdatedAt(report.created_at, isZh)}
                  {hasFailures ? ` · ${copy.canon.checkFailed}` : ""}
                </div>
                <h3 className={styles.canonRowTitle}>
                  {isZh ? `Canon Check 报告` : `Canon Check report`}
                  {report.target_scope ? ` · ${report.target_scope}` : ""}
                </h3>
                {issues.length ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {issues.map((issue, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
                        <span className={`${styles.severityChip} ${styles[issue.severity] || styles.note}`}>
                          {issue.severity}
                        </span>
                        <span style={{ fontSize: 13, color: "#d8dee0" }}>
                          <strong>{issue.title}</strong>
                          {issue.description ? ` — ${issue.description}` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className={styles.canonRowBody}>{isZh ? "无问题。" : "No issues."}</p>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

type CanonRowItem = {
  id: string;
  meta: string;
  title: string;
  body: string;
  updatedAt: string;
  tags: string[];
};

function CanonList({ items, empty, isZh }: { items: CanonRowItem[]; empty: string; isZh: boolean }) {
  if (!items.length) {
    return <div className={styles.emptyState}><strong>{empty}</strong></div>;
  }
  return (
    <div className={styles.canonList}>
      {items.map((item) => (
        <article key={item.id} className={styles.canonRow}>
          <div className={styles.canonRowMeta}>
            {item.meta} · {formatUpdatedAt(item.updatedAt, isZh)}
          </div>
          <h3 className={styles.canonRowTitle}>{item.title}</h3>
          {item.body ? <p className={styles.canonRowBody}>{item.body}</p> : null}
          {item.tags.length ? (
            <div className={styles.canonRowTags}>
              {item.tags.map((tag, idx) => (
                <span key={idx} className={styles.lockedChip}>{tag}</span>
              ))}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
