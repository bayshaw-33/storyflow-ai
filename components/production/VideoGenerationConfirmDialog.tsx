"use client";

import type { PrevisVersionSummary } from "@/lib/director/previs-version";
import styles from "../v2/workbench-shell/workbench-shell.module.css";

type VideoGenerationConfirmDialogProps = {
  open: boolean;
  shotLabel: string;
  previsVersion: PrevisVersionSummary | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function VideoGenerationConfirmDialog({
  open,
  shotLabel,
  previsVersion,
  busy,
  onConfirm,
  onCancel,
}: VideoGenerationConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="video-confirm-title">
      <div className={styles.dialog}>
        <h2 id="video-confirm-title" className={styles.dialogTitle}>确认视频生成条件</h2>
        <p className={styles.dialogMessage}>{shotLabel}</p>
        {previsVersion ? (
          <div style={{ display: "grid", gap: 12, maxHeight: "58vh", overflowY: "auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "96px minmax(0, 1fr)", gap: 12, alignItems: "start" }}>
              <img
                src={previsVersion.firstframeUrl}
                alt="视频生成首帧"
                style={{ width: 96, aspectRatio: "9 / 16", objectFit: "cover", borderRadius: 8, background: "#050708" }}
              />
              <div>
                <p className={styles.dialogMessage} style={{ marginTop: 0 }}>白模版本 v{previsVersion.versionNo}</p>
                <p className={styles.dialogMessage}>首帧已锁定为保存版本对应的生成结果。</p>
              </div>
            </div>
            <div>
              <strong>提示词</strong>
              <p className={styles.dialogMessage} style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{previsVersion.prompt}</p>
            </div>
            <div>
              <strong>可原样传递</strong>
              <p className={styles.dialogMessage}>{previsVersion.capabilityTranslation.preserved.join(" · ")}</p>
            </div>
            <div>
              <strong>无法原样传递</strong>
              <p className={styles.dialogMessage}>{previsVersion.capabilityTranslation.lossy.join(" · ")}</p>
            </div>
          </div>
        ) : (
          <p className={styles.dialogMessage}>当前镜头没有采用白模版本，将使用已确认的分镜首帧和当前视频提示词。</p>
        )}
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogButton} onClick={onCancel} disabled={busy}>取消</button>
          <button type="button" className={`${styles.dialogButton} ${styles.dialogButtonPrimary}`} onClick={onConfirm} disabled={busy}>
            {busy ? "提交中…" : "确认生成"}
          </button>
        </div>
      </div>
    </div>
  );
}
