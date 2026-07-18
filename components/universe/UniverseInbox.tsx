"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import type {
  UniverseInboxItem,
  UniverseEntitlement,
  UniverseSyncResult,
} from "@/lib/universe";
import {
  getUniverseCopy,
  formatUpdatedAt,
  formatConfidence,
  summarizeInboxFields,
} from "./universe-view-model";
import styles from "./universe.module.css";

type UniverseInboxProps = {
  inbox: UniverseInboxItem[];
  entitlement: UniverseEntitlement;
  isZh: boolean;
  projectsById: Map<string, { id: string; title: string }>;
  onAccept: (item: UniverseInboxItem, editedPayload?: Record<string, unknown>) => Promise<void>;
  onReject: (item: UniverseInboxItem) => Promise<void>;
  onExtract?: (projectId: string) => Promise<void>;
  selectableLinks: Array<{ projectId: string; title: string }>;
  extracting?: boolean;
};

/**
 * PRD §6.5 待处理 Inbox。
 * 每个候选项展示对象/来源/原文片段/AI-fallback 来源/置信度/字段级变更摘要/
 * 接受-编辑后接受-拒绝。不得把 raw JSON 作为主要 UI。
 */
export function UniverseInbox({
  inbox,
  entitlement,
  isZh,
  projectsById,
  onAccept,
  onReject,
  onExtract,
  selectableLinks,
  extracting,
}: UniverseInboxProps) {
  const copy = getUniverseCopy(isZh);
  const [editing, setEditing] = useState<UniverseInboxItem | null>(null);
  const [draft, setDraft] = useState("");
  const [draftError, setDraftError] = useState("");
  const [extractProjectId, setExtractProjectId] = useState("");
  const [busy, setBusy] = useState(false);

  function openEditor(item: UniverseInboxItem) {
    setEditing(item);
    setDraft(JSON.stringify(item.proposed_payload || {}, null, 2));
    setDraftError("");
  }

  function closeEditor() {
    setEditing(null);
    setDraft("");
    setDraftError("");
  }

  async function submitEdited() {
    if (!editing) return;
    let parsed: Record<string, unknown>;
    try {
      const value = JSON.parse(draft) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        setDraftError(copy.inbox.invalidJson);
        return;
      }
      parsed = value as Record<string, unknown>;
    } catch (err) {
      setDraftError(err instanceof Error ? err.message : copy.inbox.invalidJson);
      return;
    }
    setBusy(true);
    try {
      await onAccept(editing, parsed);
      closeEditor();
    } finally {
      setBusy(false);
    }
  }

  async function handleAccept(item: UniverseInboxItem) {
    setBusy(true);
    try {
      await onAccept(item);
    } finally {
      setBusy(false);
    }
  }

  async function handleReject(item: UniverseInboxItem) {
    setBusy(true);
    try {
      await onReject(item);
    } finally {
      setBusy(false);
    }
  }

  async function handleExtract() {
    if (!onExtract || !extractProjectId) return;
    setBusy(true);
    try {
      await onExtract(extractProjectId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {onExtract && selectableLinks.length ? (
        <div className={styles.actionBar}>
          <select
            className={styles.select}
            value={extractProjectId}
            onChange={(event) => setExtractProjectId(event.target.value)}
            disabled={!selectableLinks.length}
          >
            <option value="">{copy.canon.selectProject}</option>
            {selectableLinks.map((link) => (
              <option key={link.projectId} value={link.projectId}>{link.title}</option>
            ))}
          </select>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={handleExtract}
            disabled={!extractProjectId || extracting || busy || !entitlement.canUse}
          >
            {extracting || busy ? <Loader2 size={14} className="spin" /> : null}
            {copy.inbox.extract}
          </button>
          <span style={{ fontSize: 12, color: "#8f999b" }}>{copy.inbox.extractHint}</span>
        </div>
      ) : null}

      {!inbox.length ? (
        <div className={styles.emptyState}>
          <strong>{copy.inbox.empty}</strong>
        </div>
      ) : (
        <div className={styles.inboxList}>
          {inbox.map((item) => {
            const sourceProject = item.project_id ? projectsById.get(item.project_id) : null;
            const fields = summarizeInboxFields(item.proposed_payload || {}, item.item_type, isZh);
            const isPending = item.status === "pending";
            return (
              <article key={item.id} className={styles.inboxCard}>
                <div className={styles.inboxHead}>
                  <span className={styles.inboxType}>{item.item_type}</span>
                  <span className={`${styles.inboxStatus} ${styles[item.status] || styles.pending}`}>
                    {copy.inbox[item.status as keyof typeof copy.inbox] || item.status}
                  </span>
                  <span className={styles.inboxConfidence}>
                    {copy.inbox.confidence}: <strong>{formatConfidence(item.confidence)}</strong>
                  </span>
                  <span className={styles.spacer} />
                  <span style={{ fontSize: 11, color: "#8f999b" }}>{formatUpdatedAt(item.updated_at, isZh)}</span>
                </div>

                <h3 className={styles.inboxTitle}>{item.title}</h3>

                <div className={styles.inboxMetaGrid}>
                  <div>
                    <label>{copy.inbox.object}</label>
                    <div>{item.title}</div>
                  </div>
                  <div>
                    <label>{copy.inbox.source}</label>
                    <div>{sourceProject?.title || item.project_id || "—"}</div>
                  </div>
                  <div>
                    <label>{copy.inbox.aiFallback}</label>
                    <div>{item.item_type}</div>
                  </div>
                </div>

                {item.source_excerpt ? (
                  <blockquote className={styles.inboxExcerpt}>{item.source_excerpt}</blockquote>
                ) : null}

                {fields.length ? (
                  <div className={styles.fieldChanges}>
                    <label style={{ fontSize: 10.5, color: "#6f787a", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      {copy.inbox.fields}
                    </label>
                    {fields.map((row, idx) => (
                      <div key={idx} className={styles.fieldRow}>
                        <span className={styles.fieldLabel}>{row.field}</span>
                        <span className={styles.fieldValue}>{row.value}</span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {isPending ? (
                  <div className={styles.inboxActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      disabled={!entitlement.canUse || busy}
                      onClick={() => handleAccept(item)}
                    >
                      <CheckCircle2 size={14} />
                      {copy.inbox.accept}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={!entitlement.canUse || busy}
                      onClick={() => openEditor(item)}
                    >
                      {copy.inbox.editAccept}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={!entitlement.canUse || busy}
                      onClick={() => handleReject(item)}
                    >
                      <XCircle size={14} />
                      {copy.inbox.reject}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {editing ? (
        <div className={styles.modalBackdrop} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2>{copy.inbox.editTitle}</h2>
            <p>{copy.inbox.editBody}</p>
            <textarea value={draft} onChange={(event) => setDraft(event.target.value)} />
            {draftError ? <p className={styles.formError}>{draftError}</p> : null}
            <div className={styles.modalActions}>
              <button type="button" className={styles.secondaryButton} onClick={closeEditor} disabled={busy}>
                {copy.inbox.cancel}
              </button>
              <button type="button" className={styles.primaryButton} onClick={submitEdited} disabled={busy}>
                {busy ? <Loader2 size={14} className="spin" /> : <CheckCircle2 size={14} />}
                {copy.inbox.save}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// UniverseSyncResult is imported for type completeness; callers use it via onAccept/onReject.
export type { UniverseSyncResult };
