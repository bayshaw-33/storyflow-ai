"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import type { MarketplaceAsset } from "@/lib/client/v2/marketplace/types";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  buildGrantSummary,
  createProjectCopy,
  validateUsageEntry,
} from "@/lib/client/v2/marketplace/usage";
import { formatPrice, isLicenseCommercial } from "@/lib/client/v2/marketplace/filtering";
import styles from "./marketplace.module.css";

interface UsageEntryModalProps {
  asset: MarketplaceAsset;
  onClose: () => void;
  onConfirmed: (copyId: string) => void;
}

/**
 * 调用入口 Modal（PRD §9.5）。
 *
 * 流程：
 * 1. 选择目标项目和角色/用途
 * 2. 显示授权摘要，用户确认
 * 3. 创建项目级副本（不修改原资产），保留来源关系
 *
 * 关键约束：
 * - 不修改原资产（createProjectCopy 是纯函数，返回独立副本）
 * - 资产 suspended/archived 时停止新调用
 * - 真人肖像未确认授权时不得商业/公开发布
 */
export function UsageEntryModal({ asset, onClose, onConfirmed }: UsageEntryModalProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [projectId, setProjectId] = useState("");
  const [projectName, setProjectName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [usagePurpose, setUsagePurpose] = useState(isZh ? "平台内项目" : "Platform project");
  const [step, setStep] = useState<"form" | "confirm" | "done">("form");
  const [error, setError] = useState<string | null>(null);
  const [copyId, setCopyId] = useState<string | null>(null);

  const request = { assetId: asset.id, projectId, projectName, roleName, usagePurpose };

  const handleValidate = () => {
    setError(null);
    const result = validateUsageEntry(asset, request);
    if (!result.valid) {
      setError(result.error || (isZh ? "校验失败" : "Validation failed"));
      return;
    }
    setStep("confirm");
  };

  const handleConfirm = () => {
    setError(null);
    // 再次校验（防止资产状态在确认期间变化）
    const result = validateUsageEntry(asset, request);
    if (!result.valid) {
      setError(result.error || (isZh ? "校验失败" : "Validation failed"));
      return;
    }
    // 创建项目级副本（不修改原资产）
    const grantId = `grant-${asset.id}-${Date.now()}`;
    const copy = createProjectCopy(asset, request, grantId);
    setCopyId(copy.id);
    setStep("done");
  };

  const summary = buildGrantSummary(asset, request);
  const commercial = isLicenseCommercial(asset.licenseOffer);

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className={styles.modalTitle}>
            {isZh ? "调用资产到项目" : "Use asset in project"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}
            aria-label="close"
          >
            <X size={16} />
          </button>
        </div>

        {/* 步骤 1：填写表单 */}
        {step === "form" && (
          <>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 16px" }}>
              {isZh
                ? "选择目标项目与角色/用途。调用会创建项目级副本，不修改原资产。"
                : "Select target project and role/use. This creates a project-level copy without modifying the original asset."}
            </p>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {isZh ? "目标项目 ID" : "Target project ID"} *
              </label>
              <input
                className={styles.input}
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
                placeholder={isZh ? "例：proj-night-rule" : "e.g. proj-night-rule"}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {isZh ? "项目名称" : "Project name"} *
              </label>
              <input
                className={styles.input}
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder={isZh ? "例：夜色法则" : "e.g. Night Rule"}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {isZh ? "角色/用途名称" : "Role / use name"} *
              </label>
              <input
                className={styles.input}
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder={isZh ? "例：女主角 Mara" : "e.g. Lead Mara"}
              />
            </div>
            <div className={styles.fieldGroup}>
              <label className={styles.fieldLabel}>
                {isZh ? "使用用途" : "Usage purpose"}
              </label>
              <select
                className={styles.input}
                value={usagePurpose}
                onChange={(e) => setUsagePurpose(e.target.value)}
              >
                <option value={isZh ? "平台内项目" : "Platform project"}>
                  {isZh ? "平台内项目（非商业）" : "Platform project (non-commercial)"}
                </option>
                <option value={isZh ? "单项目商业" : "Single-project commercial"}>
                  {isZh ? "单项目商业" : "Single-project commercial"}
                </option>
                <option value={isZh ? "分镜预览" : "Storyboard preview"}>
                  {isZh ? "分镜预览" : "Storyboard preview"}
                </option>
                <option value={isZh ? "衍生开发" : "Derivative development"}>
                  {isZh ? "衍生开发" : "Derivative development"}
                </option>
              </select>
            </div>

            {asset.portraitBased && asset.rightsStatus !== "confirmed" && (
              <div className={styles.rightsBlock}>
                <AlertTriangle size={12} style={{ display: "inline", marginRight: 4 }} />
                {isZh
                  ? "该资产基于真人肖像且权利未确认，不得用于商业或公开发布。"
                  : "This asset is portrait-based with unconfirmed rights; commercial or public use is prohibited."}
              </div>
            )}

            {error && <div className={styles.errorBox}>{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button type="button" className={styles.button} onClick={onClose}>
                {isZh ? "取消" : "Cancel"}
              </button>
              <button type="button" className={styles.buttonPrimary} onClick={handleValidate}>
                {isZh ? "下一步：授权确认" : "Next: license confirm"}
              </button>
            </div>
          </>
        )}

        {/* 步骤 2：授权确认 */}
        {step === "confirm" && (
          <>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 12px" }}>
              {isZh ? "请确认授权摘要。确认后将创建项目级副本。" : "Please confirm the license summary. A project-level copy will be created."}
            </p>
            <div className={styles.summaryBox}>
              <div>
                {isZh ? "资产" : "Asset"}: <strong>{summary.assetName}</strong>
              </div>
              <div>
                {isZh ? "创建者" : "Creator"}: <strong>{summary.creatorName}</strong>
              </div>
              <div>
                {isZh ? "授权方式" : "License"}: {summary.licenseType}
                {commercial ? (isZh ? "（商业）" : " (commercial)") : (isZh ? "（非商业）" : " (non-commercial)")}
              </div>
              <div>
                {isZh ? "价格" : "Price"}: <strong>{formatPrice(asset.licenseOffer, locale)}</strong>
              </div>
              <div>
                {isZh ? "项目" : "Project"}: {summary.projectName || projectId}
              </div>
              <div>
                {isZh ? "角色/用途" : "Role/use"}: {summary.roleName}
              </div>
              {summary.portraitWarning && (
                <div style={{ color: "#ff8b8b", marginTop: 6 }}>{summary.portraitWarning}</div>
              )}
            </div>
            <div className={styles.noticeBox}>
              {isZh
                ? "调用将创建独立的项目级副本，原资产不会被修改。原资产撤销后，本副本作为已有合法作品保留。来源关系（原创建者）会被保留。"
                : "This creates an independent project-level copy; the original asset is not modified. If the original is revoked, this copy remains as existing lawful work. Source lineage (original creator) is preserved."}
            </div>

            {error && <div className={styles.errorBox}>{error}</div>}

            <div style={{ display: "flex", gap: 8, justifyContent: "space-between", marginTop: 20 }}>
              <button type="button" className={styles.button} onClick={() => setStep("form")}>
                {isZh ? "返回" : "Back"}
              </button>
              <button type="button" className={styles.buttonPrimary} onClick={handleConfirm}>
                {isZh ? "确认调用（创建副本）" : "Confirm (create copy)"}
              </button>
            </div>
          </>
        )}

        {/* 步骤 3：完成 */}
        {step === "done" && copyId && (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <CheckCircle2 size={40} style={{ color: "#7dd181", marginBottom: 12 }} />
            <p style={{ fontSize: 14, color: "#f4f7f8", margin: "0 0 6px", fontWeight: 700 }}>
              {isZh ? "调用成功" : "Usage created"}
            </p>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", margin: "0 0 16px" }}>
              {isZh ? "已创建项目级副本，原资产未被修改。" : "Project-level copy created. Original asset not modified."}
            </p>
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", margin: "0 0 20px", wordBreak: "break-all" }}>
              {isZh ? "副本 ID" : "Copy ID"}: {copyId}
            </p>
            <button type="button" className={styles.buttonPrimary} onClick={() => onConfirmed(copyId)}>
              {isZh ? "完成" : "Done"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
