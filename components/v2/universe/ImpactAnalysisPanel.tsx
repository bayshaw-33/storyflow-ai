"use client";

// 交付物 9：影响分析入口
// 修改 Canon 前查看影响范围（受影响作品 / 项目快照 / 角色 / 场景 / 分镜 / 资产）。

import { useMemo, useState } from "react";
import { AlertCircle, ShieldCheck, Loader2 } from "lucide-react";
import type { UniverseBundleV2 } from "@/lib/client/v2/universe/types";
import styles from "./universe.module.css";
import { GuideHint } from "./shared";

// 资产查找表，用于把 ID 解析为可读名称。
function buildAssetLookup(bundle: UniverseBundleV2): Record<string, { name: string; kind: string }> {
  const map: Record<string, { name: string; kind: string }> = {};
  for (const c of bundle.characters) map[c.id] = { name: c.name, kind: "角色" };
  for (const l of bundle.locations) map[l.id] = { name: l.name, kind: "地点" };
  for (const o of bundle.organizations) map[o.id] = { name: o.name, kind: "组织" };
  for (const p of bundle.props) map[p.id] = { name: p.name, kind: "道具" };
  for (const c of bundle.concepts) map[c.id] = { name: c.name, kind: "概念" };
  for (const r of bundle.rules) map[r.id] = { name: r.name, kind: "规则" };
  return map;
}

export function ImpactAnalysisPanel({ bundle }: { bundle: UniverseBundleV2 }) {
  const { canonFacts, works, impactAnalysis } = bundle;
  const [selectedCanonId, setSelectedCanonId] = useState<string>(impactAnalysis.targetCanonId);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(true);

  const lookup = useMemo(() => buildAssetLookup(bundle), [bundle]);
  const worksLookup = useMemo(() => new Map(works.map((w) => [w.id, w])), [works]);

  // 当前选中的 Canon Fact。
  const selectedCanon = canonFacts.find((f) => f.id === selectedCanonId);

  // 当前显示的影响范围（fixture 中仅 targetCanonId 有完整示例，其它 Canon 用其 references 推导简化影响）。
  const impact = useMemo(() => {
    if (selectedCanonId === impactAnalysis.targetCanonId) {
      return impactAnalysis;
    }
    // 简化推导：把 Canon Fact 的 references 作为受影响资产，关联作品取所有继承/衍生作品。
    return {
      targetCanonId: selectedCanonId,
      affectedWorks: works
        .filter((w) => w.relationship === "inherited" || w.relationship === "derived")
        .map((w) => w.id),
      affectedSnapshots: works
        .filter((w) => w.snapshotId)
        .map((w) => w.snapshotId!),
      affectedAssets: selectedCanon?.references ?? [],
    };
  }, [selectedCanonId, impactAnalysis, works, selectedCanon]);

  async function runAnalysis() {
    setAnalyzing(true);
    setAnalyzed(false);
    // 模拟分析延迟。
    await new Promise((r) => setTimeout(r, 300));
    setAnalyzing(false);
    setAnalyzed(true);
  }

  return (
    <div>
      <div className={styles.card}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>
            <AlertCircle size={16} />
            影响分析
          </h2>
        </div>

        <GuideHint>
          修改 Canon Fact 前（特别是解锁后），先选择目标 Canon 查看其影响范围。受影响的作品、项目快照与资产会列在下方，便于评估变更代价。
        </GuideHint>

        {/* Canon 选择器 */}
        <div style={{ marginTop: 16, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>目标 Canon Fact：</label>
          <select
            value={selectedCanonId}
            onChange={(e) => {
              setSelectedCanonId(e.target.value);
              setAnalyzed(false);
            }}
            className={styles.button}
            style={{ padding: "8px 10px", minWidth: 320 }}
          >
            {canonFacts.map((f) => (
              <option key={f.id} value={f.id} style={{ background: "#070808" }}>
                {f.id} · {f.statement.slice(0, 40)}{f.statement.length > 40 ? "…" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.button} ${styles.buttonPrimary}`}
            onClick={() => void runAnalysis()}
            disabled={analyzing}
          >
            {analyzing ? <Loader2 size={14} className="spin" /> : <ShieldCheck size={14} />}
            重新分析影响
          </button>
        </div>

        {/* 选中的 Canon Fact 详情 */}
        {selectedCanon ? (
          <div style={{ marginTop: 16, padding: 14, borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 11, color: "#6de7df", fontWeight: 700 }}>{selectedCanon.id}</span>
              <span className={`${styles.statusBadge} ${selectedCanon.locked ? styles.statusLocked : styles.statusUnlocked}`}>
                {selectedCanon.locked ? "LOCKED" : "UNLOCKED"}
              </span>
            </div>
            <p style={{ fontSize: 14, color: "#f4f7f8", margin: 0, lineHeight: 1.6 }}>{selectedCanon.statement}</p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", margin: "8px 0 0" }}>来源：{selectedCanon.source}</p>
          </div>
        ) : null}

        {/* 影响范围结果 */}
        {analyzed ? (
          <div style={{ marginTop: 16 }}>
            <div className={styles.impactList}>
              <div className={styles.impactItem}>
                <p className={styles.impactLabel}>受影响作品（{impact.affectedWorks.length}）</p>
                <div className={styles.impactValues}>
                  {impact.affectedWorks.length === 0 ? (
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>无</span>
                  ) : (
                    impact.affectedWorks.map((id) => {
                      const w = worksLookup.get(id);
                      return (
                        <span key={id} className={styles.impactChip}>
                          {w?.title ?? id}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              <div className={styles.impactItem}>
                <p className={styles.impactLabel}>受影响项目快照（{impact.affectedSnapshots.length}）</p>
                <div className={styles.impactValues}>
                  {impact.affectedSnapshots.length === 0 ? (
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>无</span>
                  ) : (
                    impact.affectedSnapshots.map((id) => (
                      <span key={id} className={styles.impactChip}>{id}</span>
                    ))
                  )}
                </div>
              </div>

              <div className={styles.impactItem}>
                <p className={styles.impactLabel}>受影响资产（{impact.affectedAssets.length}）</p>
                <div className={styles.impactValues}>
                  {impact.affectedAssets.length === 0 ? (
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>无</span>
                  ) : (
                    impact.affectedAssets.map((id) => {
                      const meta = lookup[id];
                      return (
                        <span key={id} className={styles.impactChip}>
                          {meta ? `${meta.kind}：${meta.name}` : id}
                        </span>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            <GuideHint>
              修改此 Canon Fact 后，以上作品的项目快照可能需要重新生成，受影响资产可能需要重新审核。建议在 Inbox 提交对应 Change Proposal 而非直接修改 Canon。
            </GuideHint>
          </div>
        ) : null}
      </div>
    </div>
  );
}
