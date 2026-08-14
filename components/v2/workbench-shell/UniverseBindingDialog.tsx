"use client";

// Phase 2 Task 2.5 — Universe 绑定对话框。
//
// standalone Work 点击"绑定已有 Universe"时弹出。用户选择 Universe ID、
// Work 与 Universe 的关系（canon_continuation/prequel/...）、Canon 策略
// （strict/flexible/reference_only），确认后调用 bindWorkToUniverse API。
//
// 设计约束（PRD Task 2.5 Step 2）：
//   - 不自动弹窗：必须由用户点击"绑定已有"才显示。
//   - 不自动创建空 Universe：创建新 Universe 走独立入口（跳转 /universes/new）。
//   - 绑定是原子操作：成功后 Manifest + Snapshot 同时生成。

import { useState, type FormEvent } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  V22_WORK_RELATIONS,
  V22_CANON_POLICIES,
  type V22WorkRelation,
  type V22CanonPolicy,
  type BindWorkToUniverseInput,
} from "@/lib/client/v2/universe/types";
import styles from "./workbench-shell.module.css";

export interface UniverseBindingDialogProps {
  workId: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (input: BindWorkToUniverseInput) => Promise<void>;
}

const RELATION_OPTIONS: Array<{ value: V22WorkRelation; zh: string; en: string }> = [
  { value: "canon_continuation", zh: "正史续作", en: "Canon continuation" },
  { value: "prequel", zh: "前传", en: "Prequel" },
  { value: "sequel", zh: "续作", en: "Sequel" },
  { value: "spinoff", zh: "衍生", en: "Spinoff" },
  { value: "adaptation", zh: "改编", en: "Adaptation" },
  { value: "parallel", zh: "平行", en: "Parallel" },
];

const POLICY_OPTIONS: Array<{ value: V22CanonPolicy; zh: string; en: string }> = [
  { value: "strict", zh: "严格（完全继承 Canon）", en: "Strict (full canon)" },
  { value: "flexible", zh: "灵活（可局部偏离）", en: "Flexible (local deviation)" },
  { value: "reference_only", zh: "仅引用（不绑定更新）", en: "Reference only" },
];

export function UniverseBindingDialog({
  workId,
  open,
  onClose,
  onConfirm,
}: UniverseBindingDialogProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [universeId, setUniverseId] = useState("");
  const [relation, setRelation] = useState<V22WorkRelation>("canon_continuation");
  const [canonPolicy, setCanonPolicy] = useState<V22CanonPolicy>("strict");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  if (!open) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!universeId.trim()) {
      setError(isZh ? "请输入 Universe ID" : "Universe ID is required");
      return;
    }
    if (!workId) {
      setError(isZh ? "缺少 Work 身份，无法绑定" : "Missing Work identity");
      return;
    }
    setSubmitting(true);
    try {
      await onConfirm({
        universeId: universeId.trim(),
        relation,
        canonPolicy,
      });
      // 成功：重置并关闭。
      setUniverseId("");
      setRelation("canon_continuation");
      setCanonPolicy("strict");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : isZh ? "绑定失败" : "Binding failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.dialogOverlay} role="dialog" aria-modal="true" aria-labelledby="universe-bind-title">
      <form className={styles.dialog} onSubmit={handleSubmit}>
        <div className={styles.dialogHeader}>
          <h2 id="universe-bind-title" className={styles.dialogTitle}>
            {isZh ? "绑定 Universe" : "Bind Universe"}
          </h2>
          <button
            type="button"
            className={styles.iconButton}
            aria-label={isZh ? "关闭" : "Close"}
            onClick={onClose}
            disabled={submitting}
          >
            <X size={16} />
          </button>
        </div>

        <div className={styles.dialogBody}>
          <label className={styles.dialogField}>
            <span className={styles.dialogLabel}>{isZh ? "Universe ID" : "Universe ID"}</span>
            <input
              type="text"
              className={styles.dialogInput}
              value={universeId}
              onChange={(e) => setUniverseId(e.target.value)}
              placeholder={isZh ? "输入要绑定的 Universe ID" : "Enter Universe ID to bind"}
              disabled={submitting}
              autoFocus
            />
          </label>

          <label className={styles.dialogField}>
            <span className={styles.dialogLabel}>{isZh ? "关系" : "Relation"}</span>
            <select
              className={styles.dialogSelect}
              value={relation}
              onChange={(e) => setRelation(e.target.value as V22WorkRelation)}
              disabled={submitting}
            >
              {RELATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {isZh ? opt.zh : opt.en}
                </option>
              ))}
            </select>
          </label>

          <label className={styles.dialogField}>
            <span className={styles.dialogLabel}>{isZh ? "Canon 策略" : "Canon policy"}</span>
            <select
              className={styles.dialogSelect}
              value={canonPolicy}
              onChange={(e) => setCanonPolicy(e.target.value as V22CanonPolicy)}
              disabled={submitting}
            >
              {POLICY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {isZh ? opt.zh : opt.en}
                </option>
              ))}
            </select>
          </label>

          {error && (
            <div className={`${styles.dialogError}`} role="alert">
              <AlertCircle size={14} />
              {error}
            </div>
          )}
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="button"
            className={styles.dialogCancelBtn}
            onClick={onClose}
            disabled={submitting}
          >
            {isZh ? "取消" : "Cancel"}
          </button>
          <button
            type="submit"
            className={styles.dialogConfirmBtn}
            disabled={submitting || !universeId.trim()}
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="tc-spin" />
                {isZh ? "绑定中…" : "Binding…"}
              </>
            ) : (
              isZh ? "确认绑定" : "Confirm bind"
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

// 导出选项供测试断言。
export { RELATION_OPTIONS, POLICY_OPTIONS, V22_WORK_RELATIONS, V22_CANON_POLICIES };
