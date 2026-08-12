"use client";

import { memo } from "react";
import { FileText, Sparkles, ArrowRight, CheckCircle2, Lock } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ScriptCandidate, ShortDramaData } from "@/lib/client/v2/short-drama/types";
import { getStageCompletion } from "@/lib/client/v2/short-drama/flow-machine";
import { StageHeader } from "./StageHeader";
import styles from "../short-drama-flow.module.css";

export interface ScriptStageProps {
  data: ShortDramaData;
  // 切换候选确认状态
  onToggleCandidate: (candidateId: string, kind: ScriptCandidate["kind"]) => void;
  // 运行 AI 结构分析（fixture 模拟）
  onRunAnalysis: () => void;
  // 标记完成并推进到美术阶段
  onAdvance: () => void;
}

function ScriptStageComponent({ data, onToggleCandidate, onRunAnalysis, onAdvance }: ScriptStageProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const script = data.stages.script;
  const completion = getStageCompletion(data.stages, "script");

  const confirmedSet = new Set([
    ...script.confirmed.characterIds,
    ...script.confirmed.sceneIds,
    ...script.confirmed.propIds,
  ]);

  const renderCandidate = (c: ScriptCandidate) => {
    const confirmed = confirmedSet.has(c.id);
    const kindLabel = c.kind === "character" ? (isZh ? "角色" : "char") : c.kind === "scene" ? (isZh ? "场景" : "scene") : (isZh ? "道具" : "prop");
    return (
      <li key={c.id} className={`${styles.candidateItem} ${confirmed ? styles.candidateItemConfirmed : ""}`}>
        <input
          type="checkbox"
          className={styles.checkbox}
          checked={confirmed}
          onChange={() => onToggleCandidate(c.id, c.kind)}
          aria-label={c.name}
        />
        <div className={styles.candidateMain}>
          <div>
            <span className={styles.candidateName}>{c.name}</span>
            <span className={styles.candidateKind}>{kindLabel}</span>
          </div>
          <div className={styles.candidateSummary}>{c.summary}</div>
        </div>
        {confirmed && <CheckCircle2 size={14} style={{ color: "#6de7df" }} />}
      </li>
    );
  };

  return (
    <div className={styles.stageContainer}>
      <StageHeader title={isZh ? "剧本阶段" : "Script"} status={script.status} locale={locale} />

      {script.status === "locked" ? (
        <div className={styles.lockedNotice}>
          <Lock size={14} />
          {isZh ? "该阶段未解锁，请先完成前置阶段。" : "Stage locked."}
        </div>
      ) : (
        <>
          {/* 完成条件提示 */}
          <div className={`${styles.completionBanner} ${completion.complete ? "" : styles.completionBannerWarn}`}>
            {completion.complete ? <CheckCircle2 size={14} style={{ color: "#7dd181" }} /> : <Sparkles size={14} />}
            <span>{completion.reason}</span>
          </div>
          {completion.nextGuide && (
            <div className={styles.nextGuide}>
              <ArrowRight size={12} />
              {completion.nextGuide}
            </div>
          )}

          {/* 剧本原文 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <FileText size={12} />
              {isZh ? "剧本原文" : "Script"}
            </h3>
            <div className={styles.scriptBox}>{script.script || (isZh ? "（暂无剧本，请上传或输入）" : "(empty)")}</div>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.button} onClick={onRunAnalysis}>
                <Sparkles size={12} />
                {isZh ? "运行 AI 结构分析" : "Run analysis"}
              </button>
            </div>
          </section>

          {/* 角色/场景/道具候选 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Sparkles size={12} />
              {isZh ? "结构分析候选（勾选确认）" : "Candidates"}
            </h3>
            {script.analysis.characters.length === 0 &&
            script.analysis.scenes.length === 0 &&
            script.analysis.props.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "暂无候选，请先运行结构分析" : "No candidates"}</div>
            ) : (
              <ul className={styles.candidateList}>
                {script.analysis.characters.map(renderCandidate)}
                {script.analysis.scenes.map(renderCandidate)}
                {script.analysis.props.map(renderCandidate)}
              </ul>
            )}
          </section>

          {/* 推进按钮：仅当前阶段显示，回看 completed 时不显示 */}
          {script.status === "current" && (
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onAdvance}
                disabled={!completion.complete}
              >
                {isZh ? "确认并进入美术阶段" : "Confirm & advance"}
                <ArrowRight size={12} />
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export const ScriptStage = memo(ScriptStageComponent);
