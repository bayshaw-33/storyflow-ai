"use client";

import { memo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import styles from "./workbench-shell.module.css";

export interface EvidenceActionsProps {
  workId: string | null | undefined;
  locale: string;
  onDownloadEvidence?: () => Promise<void> | void;
}

function EvidenceActionsComponent({
  workId,
  locale,
  onDownloadEvidence,
}: EvidenceActionsProps) {
  const isZh = locale === "zh-CN";
  const [busy, setBusy] = useState(false);

  if (!workId || !onDownloadEvidence) return null;

  const handleDownload = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onDownloadEvidence();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.evidenceActions}>
      <button
        type="button"
        className={styles.versionButton}
        disabled={busy}
        onClick={handleDownload}
        title={isZh ? "下载留痕包（版本+对话+生成记录）" : "Download evidence package (versions + conversations + generations)"}
      >
        {busy ? <Loader2 size={12} className="tc-spin" /> : <Download size={12} />}
        {isZh ? "留痕" : "Evidence"}
      </button>
    </div>
  );
}

export const EvidenceActions = memo(EvidenceActionsComponent);
