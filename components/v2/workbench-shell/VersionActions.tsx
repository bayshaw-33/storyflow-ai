"use client";

import { memo, useState } from "react";
import { GitBranch, Bookmark, Lock, AlertTriangle } from "lucide-react";
import styles from "./workbench-shell.module.css";

export interface VersionActionsProps {
  workId: string | null | undefined;
  currentVersionId: string | null | undefined;
  latestCheckpointId: string | null | undefined;
  finalizedVersionId: string | null | undefined;
  locale: string;
  onCreateCheckpoint?: () => Promise<void> | void;
  onFinalize?: () => Promise<void> | void;
}

function VersionActionsComponent({
  workId,
  currentVersionId,
  latestCheckpointId,
  finalizedVersionId,
  locale,
  onCreateCheckpoint,
  onFinalize,
}: VersionActionsProps) {
  const isZh = locale === "zh-CN";
  const [confirmingFinalize, setConfirmingFinalize] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!workId) return null;

  const hasCheckpoint = Boolean(latestCheckpointId);
  const isFinalized = Boolean(finalizedVersionId);
  const canCheckpoint = Boolean(currentVersionId) && !isFinalized && onCreateCheckpoint;
  const canFinalize = Boolean(currentVersionId) && !isFinalized && onFinalize;

  const handleCheckpoint = async () => {
    if (!onCreateCheckpoint || busy) return;
    setBusy(true);
    try {
      await onCreateCheckpoint();
    } finally {
      setBusy(false);
    }
  };

  const handleFinalize = async () => {
    if (!onFinalize || busy || !confirmingFinalize) return;
    setBusy(true);
    try {
      await onFinalize();
    } finally {
      setBusy(false);
      setConfirmingFinalize(false);
    }
  };

  return (
    <div className={styles.versionActions}>
      <span className={`${styles.badge} ${isFinalized ? styles.badgeOk : hasCheckpoint ? styles.badgeAccent : styles.badgeWarn}`}>
        <GitBranch size={11} />
        {isFinalized
          ? isZh ? "已定稿" : "Finalized"
          : hasCheckpoint
            ? isZh ? "有快照" : "Checkpointed"
            : isZh ? "草稿" : "Draft"}
      </span>

      {canCheckpoint && (
        <button
          type="button"
          className={styles.versionButton}
          disabled={busy}
          onClick={handleCheckpoint}
          title={isZh ? "创建不可变快照" : "Create immutable checkpoint"}
        >
          <Bookmark size={12} />
          {isZh ? "快照" : "Checkpoint"}
        </button>
      )}

      {canFinalize && !confirmingFinalize && (
        <button
          type="button"
          className={styles.versionButton}
          disabled={busy}
          onClick={() => setConfirmingFinalize(true)}
          title={isZh ? "定稿当前版本（不可逆）" : "Finalize current version (irreversible)"}
        >
          <Lock size={12} />
          {isZh ? "定稿" : "Finalize"}
        </button>
      )}

      {confirmingFinalize && (
        <span className={styles.finalizeConfirm}>
          <AlertTriangle size={12} />
          <span>{isZh ? "定稿后不可修改，确认？" : "Finalize is irreversible. Confirm?"}</span>
          <button
            type="button"
            className={styles.versionButton}
            disabled={busy}
            onClick={handleFinalize}
          >
            {isZh ? "确认" : "Yes"}
          </button>
          <button
            type="button"
            className={styles.versionButton}
            disabled={busy}
            onClick={() => setConfirmingFinalize(false)}
          >
            {isZh ? "取消" : "No"}
          </button>
        </span>
      )}
    </div>
  );
}

export const VersionActions = memo(VersionActionsComponent);
