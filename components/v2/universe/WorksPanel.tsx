"use client";

// 交付物 4：作品页
// 关联作品列表，显示继承关系和衍生关系。
// Phase 2 Task 2.5 Step 3：新增"从 Universe 创建 Work"入口——
// 选择 Work 类型和关系后跳转 project-start（带 universeId + relation 参数），
// project-start 创建 Work 时调用 Task 2.2 绑定，进入工作台时 Manifest 已存在。

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Film, GitBranch, Link2, Copy, Plus, ChevronDown, ChevronUp } from "lucide-react";
import type { UniverseBundleV2, WorkLink, V22WorkRelation, V22CanonPolicy } from "@/lib/client/v2/universe/types";
import { V22_WORK_RELATIONS, V22_CANON_POLICIES } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

const RELATIONSHIP_META: Record<WorkLink["relationship"], { label: string; icon: typeof GitBranch; color: string }> = {
  inherited: { label: "继承", icon: GitBranch, color: "#6de7df" },
  derived: { label: "衍生", icon: Copy, color: "#c792ea" },
  referenced: { label: "引用", icon: Link2, color: "#ffd166" },
};

// V22 关系选项（与 BindingDialog 一致）。
const V22_RELATION_LABELS: Record<V22WorkRelation, string> = {
  canon_continuation: "正史续作",
  prequel: "前传",
  sequel: "续作",
  spinoff: "衍生",
  adaptation: "改编",
  parallel: "平行",
};

// 可创建的 Work 类型（对齐 WorkbenchAdapter.workbenchType）。
const WORK_TYPE_OPTIONS = [
  { value: "script", label: "剧本" },
  { value: "novel", label: "小说" },
  { value: "art", label: "美术" },
  { value: "production", label: "制片" },
  { value: "video", label: "视频" },
  { value: "song", label: "音乐" },
] as const;

export function WorksPanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { works, universe } = bundle;
  const router = useRouter();
  const [showCreate, setShowCreate] = useState(false);
  const [workType, setWorkType] = useState<string>("script");
  const [relation, setRelation] = useState<V22WorkRelation>("canon_continuation");
  const [canonPolicy, setCanonPolicy] = useState<V22CanonPolicy>("strict");

  // 从 Universe 创建 Work：跳转 project-start 并携带绑定参数。
  // project-start 创建 Work 后读取这些参数调用 Task 2.2 绑定 API，
  // 确保进入工作台时 Manifest 已存在。
  const handleCreateWork = () => {
    const params = new URLSearchParams({
      universeId: universe.id,
      relation,
      canonPolicy,
      workType,
    });
    router.push(`/project-start?${params.toString()}`);
  };

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <Film size={16} />
            关联作品
            <span className={styles.cardCount}>共 {works.length} 个</span>
          </h2>
          {/* Phase 2 Task 2.5 Step 3: 从 Universe 创建 Work 入口 */}
          <button
            type="button"
            className={styles.createWorkToggle}
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
          >
            {showCreate ? <ChevronUp size={14} /> : <Plus size={14} />}
            从 Universe 创建 Work
          </button>
        </div>

        {showCreate && (
          <div className={styles.createWorkForm}>
            <label className={styles.createWorkField}>
              <span>Work 类型</span>
              <select value={workType} onChange={(e) => setWorkType(e.target.value)}>
                {WORK_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </label>
            <label className={styles.createWorkField}>
              <span>关系</span>
              <select value={relation} onChange={(e) => setRelation(e.target.value as V22WorkRelation)}>
                {V22_WORK_RELATIONS.map((r) => (
                  <option key={r} value={r}>{V22_RELATION_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <label className={styles.createWorkField}>
              <span>Canon 策略</span>
              <select value={canonPolicy} onChange={(e) => setCanonPolicy(e.target.value as V22CanonPolicy)}>
                {V22_CANON_POLICIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className={styles.createWorkConfirm}
              onClick={handleCreateWork}
            >
              创建并绑定
            </button>
          </div>
        )}

        <ul className={styles.list}>
          {works.map((w) => {
            const meta = RELATIONSHIP_META[w.relationship];
            const Icon = meta.icon;
            return (
              <li key={w.id} className={styles.row}>
                <div className={styles.rowHeader}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <p className={styles.rowTitle}>{w.title}</p>
                    <span
                      className={styles.statusBadge}
                      style={{ color: meta.color, background: `${meta.color}1a`, borderColor: meta.color }}
                    >
                      <Icon size={11} />
                      {meta.label}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{w.type}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span>作品 ID：{w.id}</span>
                  {w.snapshotId ? <span>快照：{w.snapshotId}</span> : null}
                </div>
              </li>
            );
          })}
        </ul>

        <GuideHint>
          继承关系：作品直接使用 Universe 当前 Canon；衍生关系：作品基于某个快照衍生，可独立演化；引用关系：作品仅引用部分设定，不绑定 Canon 更新。
        </GuideHint>
      </div>
    </div>
  );
}
