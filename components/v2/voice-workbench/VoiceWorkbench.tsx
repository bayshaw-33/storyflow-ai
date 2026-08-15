"use client";

/**
 * 轻量配音工作台 — Phase 5 Task 5.4.
 * 选择角色/旁白/台词 → Voice Identity → 语言/情绪/速度 → 生成并试听。
 * 不增加复杂流程向导；Provider 不可用时按钮禁用并显示真实原因。
 */

import { useCallback, useState } from "react";
import { VoiceLineEditor } from "./VoiceLineEditor";
import styles from "./VoiceWorkbench.module.css";

export type VoiceTargetKind = "character" | "narration" | "dialogue";

export interface VoiceTarget {
  kind: VoiceTargetKind;
  id: string;
  label: string;
}

const KIND_LABELS: Record<VoiceTargetKind, string> = {
  character: "角色",
  narration: "旁白",
  dialogue: "台词",
};

export function VoiceWorkbench() {
  const [targets] = useState<VoiceTarget[]>([
    { kind: "character", id: "char-9", label: "阿仁" },
    { kind: "narration", id: "nar-1", label: "全局旁白" },
    { kind: "dialogue", id: "dl-7", label: "第 4 场 阿仁台词" },
  ]);
  const [active, setActive] = useState<VoiceTarget | null>(null);
  const [providerAvailable, setProviderAvailable] = useState<boolean | null>(null);
  const [providerName, setProviderName] = useState("");

  const handleProviderCheck = useCallback((ok: boolean, name?: string) => {
    setProviderAvailable(ok);
    setProviderName(name ?? "");
  }, []);

  return (
    <div className={styles.workbench} data-testid="voice-workbench">
      <div className={styles.header}>
        <h2>配音工作台</h2>
        <span className={styles.hint}>
          {providerAvailable === null
            ? "正在检查配音服务…"
            : providerAvailable
              ? `配音服务可用（${providerName}）`
              : `配音服务未配置（${providerName || "placeholder"}）— 无法生成，但可预览台词`}
        </span>
      </div>
      <div className={styles.body}>
        <aside className={styles.left} data-testid="voice-targets">
          <div className={styles.leftTitle}>配音目标</div>
          {targets.map((t) => (
            <button
              key={`${t.kind}:${t.id}`}
              type="button"
              className={`${styles.target} ${active?.id === t.id ? styles.active : ""}`}
              onClick={() => setActive(t)}
            >
              <span className={styles.kindBadge}>{KIND_LABELS[t.kind]}</span>
              <span>{t.label}</span>
            </button>
          ))}
        </aside>
        <main className={styles.center}>
          <VoiceLineEditor
            target={active}
            providerAvailable={providerAvailable}
            onProviderCheck={handleProviderCheck}
          />
        </main>
      </div>
    </div>
  );
}
