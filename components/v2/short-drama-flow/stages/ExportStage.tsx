"use client";

import { memo } from "react";
import { Download, Lock, CheckCircle2, Inbox, Package, AlertTriangle } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ExportPackageStatus, ShortDramaData } from "@/lib/client/v2/short-drama/types";
import { getStageCompletion } from "@/lib/client/v2/short-drama/flow-machine";
import { getExportStats } from "@/lib/client/v2/short-drama/export-manifest";
import { StageHeader } from "./StageHeader";
import styles from "../short-drama-flow.module.css";

export interface ExportStageProps {
  data: ShortDramaData;
  // 生成导出清单
  onGeneratePackages: () => void;
  // 生成 Universe Change Proposal 候选（回流入口）
  onGenerateProposals: () => void;
}

const PKG_STATUS_CLASS: Record<ExportPackageStatus, string> = {
  ready: styles.packageStatusReady,
  missing: styles.packageStatusMissing,
  partial: styles.packageStatusPartial,
};

function ExportStageComponent({ data, onGeneratePackages, onGenerateProposals }: ExportStageProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const exportStage = data.stages.export;
  const completion = getStageCompletion(data.stages, "export");
  const stats = getExportStats(exportStage.packages);
  const proposals = data.proposals;

  const pkgStatusLabel = (status: ExportPackageStatus) =>
    isZh ? (status === "ready" ? "就绪" : status === "missing" ? "缺失" : "部分缺失") : status;

  return (
    <div className={styles.stageContainer}>
      <StageHeader title={isZh ? "导出阶段" : "Export"} status={exportStage.status} locale={locale} />

      {exportStage.status === "locked" ? (
        <div className={styles.lockedNotice}>
          <Lock size={14} />
          {isZh ? "该阶段未解锁，请先完成视频阶段。" : "Stage locked."}
        </div>
      ) : (
        <>
          <div className={`${styles.completionBanner} ${completion.complete ? "" : styles.completionBannerWarn}`}>
            {completion.complete ? <CheckCircle2 size={14} style={{ color: "#7dd181" }} /> : <Download size={14} />}
            <span>{completion.reason}</span>
          </div>

          {/* 导出包列表 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Package size={12} />
              {isZh ? "导出包（不依赖临时 URL）" : "Packages"}
            </h3>
            <div className={styles.buttonRow}>
              <button type="button" className={styles.button} onClick={onGeneratePackages}>
                <Download size={12} />
                {isZh ? "生成导出清单" : "Build packages"}
              </button>
            </div>
            {exportStage.packages.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "暂无导出包，请先生成" : "No packages"}</div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
                  {isZh
                    ? `共 ${stats.total} 个包：${stats.ready} 就绪 / ${stats.partial} 部分缺失 / ${stats.missing} 缺失`
                    : `${stats.total} packages: ${stats.ready} ready / ${stats.partial} partial / ${stats.missing} missing`}
                </div>
                <ul className={styles.packageList}>
                  {exportStage.packages.map((pkg) => (
                    <li key={pkg.id} className={styles.packageItem}>
                      <span className={`${styles.packageStatus} ${PKG_STATUS_CLASS[pkg.status]}`}>
                        {pkgStatusLabel(pkg.status)}
                      </span>
                      <span className={styles.frameDesc}>{pkg.label}</span>
                      {pkg.missingReason && (
                        <span className={styles.packageReason}>
                          <AlertTriangle size={10} style={{ marginRight: 4 }} />
                          {pkg.missingReason}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          {/* 回流入口：Universe Change Proposal 候选 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>
              <Inbox size={12} />
              {isZh ? "Universe 回流候选（不自动改写 Canon）" : "Change Proposals"}
            </h3>
            <div className={styles.buttonRow}>
              <button
                type="button"
                className={`${styles.button} ${styles.buttonPrimary}`}
                onClick={onGenerateProposals}
                disabled={!completion.complete}
              >
                <Inbox size={12} />
                {isZh ? "生成回流候选进入 Inbox" : "Generate proposals"}
              </button>
            </div>
            {proposals.length === 0 ? (
              <div className={styles.emptyState}>{isZh ? "暂无回流候选" : "No proposals"}</div>
            ) : (
              <ul className={styles.proposalList}>
                {proposals.map((p) => (
                  <li key={p.id} className={styles.proposalItem}>
                    <span className={styles.proposalStatus}>{p.status}</span>
                    <span className={styles.frameDesc}>
                      {isZh ? "来源阶段" : "stage"}: {p.sourceStage}
                      {p.fieldDiffs.length > 0 && (
                        <span style={{ marginLeft: 8, color: "rgba(255,255,255,0.4)" }}>
                          {p.fieldDiffs[0].path}
                        </span>
                      )}
                    </span>
                    <span className={styles.packageReason}>confidence: {p.confidence}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

export const ExportStage = memo(ExportStageComponent);
