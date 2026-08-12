"use client";

import { memo } from "react";
import { AlertTriangle } from "lucide-react";
import styles from "./workbench-shell.module.css";

export interface UnsavedConfirmDialogProps {
  message: string;
  locale: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// 未保存提醒确认对话框。
// 上下文切换（项目/Universe/阶段）且存在未保存修改时弹出。
function UnsavedConfirmDialogComponent({ message, locale, onConfirm, onCancel }: UnsavedConfirmDialogProps) {
  const isZh = locale === "zh-CN";
  return (
    <div className={styles.overlay} role="dialog" aria-modal="true">
      <div className={styles.dialog}>
        <h2 className={styles.dialogTitle}>
          <AlertTriangle size={18} style={{ color: "#ffd166" }} />
          {isZh ? "未保存提醒" : "Unsaved changes"}
        </h2>
        <p className={styles.dialogMessage}>{message}</p>
        <div className={styles.dialogActions}>
          <button type="button" className={styles.dialogButton} onClick={onCancel}>
            {isZh ? "取消" : "Cancel"}
          </button>
          <button type="button" className={`${styles.dialogButton} ${styles.dialogButtonPrimary}`} onClick={onConfirm}>
            {isZh ? "继续切换" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

export const UnsavedConfirmDialog = memo(UnsavedConfirmDialogComponent);
