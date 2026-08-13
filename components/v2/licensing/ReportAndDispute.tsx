"use client";

/**
 * K2-T-10 交付物 6：举报和争议入口。
 *
 * 功能：
 * - 举报类型：侵权 / 冒用肖像 / 虚假来源 / 不当内容
 * - 举报表单（描述 + 证据上传入口）
 * - 争议状态查看：pending / under_review / resolved / dismissed
 * - 管理员处理记录（对用户可见的状态部分，不暴露内部细节）
 * - 用 fixture 模拟举报数据
 *
 * 关键约束：
 * - 争议状态明确可见（PRD §9.6 验收）
 * - 管理员动作记录对用户可见，但只暴露摘要，不暴露内部细节
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Flag,
  Plus,
  RefreshCw,
  Send,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";
import {
  createReport,
  fetchDisputes,
  fetchReports,
  isUnauthenticatedError,
} from "@/lib/client/v2/licensing/api";
import type {
  Dispute,
  DisputeStatus,
  LicensingStatus,
  Report,
  ReportType,
} from "@/lib/client/v2/licensing/types";
import {
  ALL_DISPUTE_STATUSES,
  ALL_REPORT_TYPES,
} from "@/lib/client/v2/licensing/types";
import {
  disputeStatusClass,
  disputeStatusLabel,
  formatTime,
  reportTypeLabel,
} from "./format";
import styles from "./licensing.module.css";

type View = "reports" | "disputes";

export function ReportAndDispute() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const [session, setSession] = useState<Session | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [disputes, setDisputes] = useState<Dispute[]>([]);
  const [status, setStatus] = useState<LicensingStatus>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [view, setView] = useState<View>("reports");
  const [disputeFilter, setDisputeFilter] = useState<DisputeStatus | "all">("all");

  // 创建举报表单状态
  const [showForm, setShowForm] = useState(false);
  const [formType, setFormType] = useState<ReportType>("infringement");
  const [formAssetId, setFormAssetId] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formEvidenceCount, setFormEvidenceCount] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 监听登录态
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) {
      setStatus("empty");
      return;
    }
    let active = true;
    void (async () => {
      try {
        const { data: authData } = await client.auth.getSession();
        if (!active) return;
        setSession(authData.session);
      } catch {
        // ignore
      }
    })();
    const { data: sub } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    setErrorMsg("");
    setSubmitError(null);
    try {
      const [reportsResult, disputesResult] = await Promise.all([
        fetchReports(session?.access_token || null),
        fetchDisputes(session?.access_token || null),
      ]);
      setReports(reportsResult.reports);
      setDisputes(disputesResult.disputes);
      setStatus(
        reportsResult.reports.length === 0 && disputesResult.disputes.length === 0
          ? "empty"
          : "ready",
      );
    } catch (err) {
      if (isUnauthenticatedError(err)) {
        setStatus("unauthenticated");
        return;
      }
      setErrorMsg(
        err instanceof Error
          ? err.message
          : isZh
            ? "加载举报与争议失败。"
            : "Failed to load reports and disputes.",
      );
      setStatus("error");
    }
  }, [session, isZh]);

  useEffect(() => {
    void load();
  }, [load]);

  const filteredDisputes = useMemo(() => {
    if (disputeFilter === "all") return disputes;
    return disputes.filter((d) => d.status === disputeFilter);
  }, [disputes, disputeFilter]);

  const handleSubmitReport = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      if (!formAssetId.trim()) {
        throw new Error(isZh ? "请填写资产 ID。" : "Please enter asset ID.");
      }
      if (!formDescription.trim()) {
        throw new Error(isZh ? "请填写举报描述。" : "Please enter description.");
      }
      const result = await createReport(
        session?.access_token || null,
        {
          type: formType,
          assetId: formAssetId.trim(),
          description: formDescription.trim(),
          evidenceCount: parseInt(formEvidenceCount, 10) || 0,
        },
      );
      setReports((prev) => [result.report, ...prev]);
      setShowForm(false);
      setFormType("infringement");
      setFormAssetId("");
      setFormDescription("");
      setFormEvidenceCount("0");
      setStatus("ready");
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : isZh
            ? "提交举报失败。"
            : "Failed to submit report.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.loading}>
            {isZh ? "加载举报与争议..." : "Loading reports and disputes..."}
          </div>
        </div>
      </main>
    );
  }

  if (status === "unauthenticated") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14 }}>
            {isZh
              ? "请先登录后查看举报与争议。"
              : "Please log in to view reports and disputes."}
          </p>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => router.push("/login")}
            style={{ marginTop: 12 }}
          >
            {isZh ? "去登录" : "Log in"}
          </button>
        </div>
      </main>
    );
  }

  if (status === "error") {
    return (
      <main className={styles.shell}>
        <div className={styles.container}>
          <div className={styles.errorBox}>{errorMsg}</div>
          <button
            type="button"
            className={styles.buttonPrimary}
            onClick={() => void load()}
          >
            <RefreshCw size={12} />
            {isZh ? "重试" : "Retry"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Kiikis 2.0 · Reports & Disputes</p>
          <h1 className={styles.title}>
            {isZh ? "举报与争议" : "Reports & disputes"}
          </h1>
          <p className={styles.subtitle}>
            {isZh
              ? "提交举报、查看争议状态与管理员处理记录。争议状态对用户明确可见。"
              : "Submit reports, view dispute status and admin actions. Dispute status is clearly visible."}
          </p>
          <div className={styles.headerActions} style={{ marginTop: 12 }}>
            <button
              type="button"
              className={styles.button}
              onClick={() => void load()}
            >
              <RefreshCw size={12} />
              {isZh ? "刷新" : "Refresh"}
            </button>
            <button
              type="button"
              className={styles.buttonPrimary}
              onClick={() => setShowForm(true)}
            >
              <Plus size={12} />
              {isZh ? "提交举报" : "Submit report"}
            </button>
          </div>
        </header>

        {/* Tab 切换 */}
        <div className={styles.tabs}>
          <button
            type="button"
            className={`${styles.tab} ${view === "reports" ? styles.tabActive : ""}`}
            onClick={() => setView("reports")}
          >
            <Flag size={11} style={{ display: "inline", marginRight: 4 }} />
            {isZh ? "我的举报" : "My reports"}
            <span className={styles.tabCount}>{reports.length}</span>
          </button>
          <button
            type="button"
            className={`${styles.tab} ${view === "disputes" ? styles.tabActive : ""}`}
            onClick={() => setView("disputes")}
          >
            <FileText size={11} style={{ display: "inline", marginRight: 4 }} />
            {isZh ? "争议" : "Disputes"}
            <span className={styles.tabCount}>{disputes.length}</span>
          </button>
        </div>

        {/* 创建举报表单 */}
        {showForm && (
          <div
            className={styles.detailPanel}
            style={{ marginBottom: 16 }}
          >
            <h2 className={styles.sectionTitle} style={{ marginTop: 0 }}>
              {isZh ? "提交新举报" : "Submit new report"}
            </h2>
            <div className={styles.form}>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "举报类型" : "Report type"} *
                </label>
                <div className={styles.optionGrid}>
                  {ALL_REPORT_TYPES.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`${styles.optionCard} ${
                        formType === t ? styles.optionCardSelected : ""
                      }`}
                      onClick={() => setFormType(t)}
                    >
                      <div className={styles.optionCardTitle}>
                        {reportTypeLabel(t, locale)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "资产 ID" : "Asset ID"} *
                </label>
                <input
                  className={styles.input}
                  value={formAssetId}
                  onChange={(e) => setFormAssetId(e.target.value)}
                  placeholder="ast-001"
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "举报描述" : "Description"} *
                </label>
                <textarea
                  className={styles.textarea}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder={
                    isZh
                      ? "请详细描述举报原因..."
                      : "Describe the report reason in detail..."
                  }
                />
              </div>
              <div className={styles.fieldGroup}>
                <label className={styles.fieldLabel}>
                  {isZh ? "证据数量" : "Evidence count"}
                </label>
                <input
                  className={styles.input}
                  type="number"
                  min="0"
                  value={formEvidenceCount}
                  onChange={(e) => setFormEvidenceCount(e.target.value)}
                />
                <p className={styles.fieldHint}>
                  {isZh
                    ? "证据上传入口由后端处理。此处仅记录数量。"
                    : "Evidence upload handled by backend. Only count is recorded here."}
                </p>
              </div>
            </div>

            {submitError && (
              <div className={styles.errorBox} style={{ marginTop: 12 }}>
                {submitError}
              </div>
            )}

            <div className={styles.actions} style={{ justifyContent: "flex-end" }}>
              <button
                type="button"
                className={styles.button}
                onClick={() => {
                  setShowForm(false);
                  setSubmitError(null);
                }}
                disabled={submitting}
              >
                {isZh ? "取消" : "Cancel"}
              </button>
              <button
                type="button"
                className={styles.buttonPrimary}
                disabled={submitting}
                onClick={() => void handleSubmitReport()}
              >
                <Send size={12} />
                {submitting
                  ? isZh
                    ? "提交中..."
                    : "Submitting..."
                  : isZh
                    ? "提交举报"
                    : "Submit"}
              </button>
            </div>
          </div>
        )}

        {/* 举报列表 */}
        {view === "reports" && (
          <>
            {reports.length === 0 ? (
              <div className={styles.empty}>
                {isZh ? "暂无举报记录。" : "No reports yet."}
              </div>
            ) : (
              <div className={styles.cardList}>
                {reports.map((report) => (
                  <div key={report.id} className={styles.card}>
                    <div className={styles.cardRow}>
                      <div className={styles.cardHead}>
                        <h3 className={styles.cardTitle}>
                          {reportTypeLabel(report.type, locale)}
                        </h3>
                        <p className={styles.cardSubtitle}>
                          {isZh ? "资产" : "Asset"}: {report.assetName}
                        </p>
                      </div>
                      <span
                        className={`${styles.statusTag} ${styles[disputeStatusClass(report.status)]}`}
                      >
                        {disputeStatusLabel(report.status, locale)}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardMetaItem}>
                        <span className={styles.cardMetaKey}>
                          {isZh ? "提交时间" : "Created"}:
                        </span>
                        <span className={styles.cardMetaVal}>
                          {formatTime(report.createdAt, locale)}
                        </span>
                      </span>
                      <span className={styles.cardMetaItem}>
                        <span className={styles.cardMetaKey}>
                          {isZh ? "证据数量" : "Evidence"}:
                        </span>
                        <span className={styles.cardMetaVal}>
                          {report.evidenceCount}
                        </span>
                      </span>
                      {report.resolvedAt && (
                        <span className={styles.cardMetaItem}>
                          <span className={styles.cardMetaKey}>
                            {isZh ? "解决时间" : "Resolved"}:
                          </span>
                          <span className={styles.cardMetaVal}>
                            {formatTime(report.resolvedAt, locale)}
                          </span>
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.7)",
                        margin: "6px 0 0",
                        lineHeight: 1.6,
                      }}
                    >
                      {report.description}
                    </p>
                    {report.adminNote && (
                      <div
                        className={styles.noticeBox}
                        style={{ marginTop: 8, marginBottom: 0 }}
                      >
                        <strong>
                          {isZh ? "管理员处理记录" : "Admin note"}:
                        </strong>{" "}
                        {report.adminNote}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 争议列表 */}
        {view === "disputes" && (
          <>
            {/* 争议状态筛选 */}
            <div className={styles.filterBar}>
              <button
                type="button"
                className={`${styles.chip} ${disputeFilter === "all" ? styles.chipActive : ""}`}
                onClick={() => setDisputeFilter("all")}
              >
                {isZh ? "全部" : "All"}
              </button>
              {ALL_DISPUTE_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`${styles.chip} ${disputeFilter === s ? styles.chipActive : ""}`}
                  onClick={() => setDisputeFilter(s)}
                >
                  {disputeStatusLabel(s, locale)}
                </button>
              ))}
            </div>

            {filteredDisputes.length === 0 ? (
              <div className={styles.empty}>
                {isZh ? "没有匹配的争议记录。" : "No matching disputes."}
              </div>
            ) : (
              <div className={styles.cardList}>
                {filteredDisputes.map((dispute) => (
                  <div key={dispute.id} className={styles.card}>
                    <div className={styles.cardRow}>
                      <div className={styles.cardHead}>
                        <h3 className={styles.cardTitle}>
                          {isZh ? "争议" : "Dispute"} #{dispute.id.slice(-8)}
                        </h3>
                        <p className={styles.cardSubtitle}>
                          {isZh ? "资产" : "Asset"}: {dispute.assetName}
                        </p>
                      </div>
                      <span
                        className={`${styles.statusTag} ${styles[disputeStatusClass(dispute.status)]}`}
                      >
                        {disputeStatusLabel(dispute.status, locale)}
                      </span>
                    </div>
                    <div className={styles.cardMeta}>
                      <span className={styles.cardMetaItem}>
                        <span className={styles.cardMetaKey}>
                          {isZh ? "授权 ID" : "Grant"}:
                        </span>
                        <span className={styles.cardMetaVal}>
                          {dispute.grantId}
                        </span>
                      </span>
                      <span className={styles.cardMetaItem}>
                        <span className={styles.cardMetaKey}>
                          {isZh ? "提交时间" : "Created"}:
                        </span>
                        <span className={styles.cardMetaVal}>
                          {formatTime(dispute.createdAt, locale)}
                        </span>
                      </span>
                      {dispute.resolvedAt && (
                        <span className={styles.cardMetaItem}>
                          <span className={styles.cardMetaKey}>
                            {isZh ? "解决时间" : "Resolved"}:
                          </span>
                          <span className={styles.cardMetaVal}>
                            {formatTime(dispute.resolvedAt, locale)}
                          </span>
                        </span>
                      )}
                    </div>
                    <p
                      style={{
                        fontSize: 12,
                        color: "rgba(255,255,255,0.7)",
                        margin: "6px 0 0",
                        lineHeight: 1.6,
                      }}
                    >
                      <strong>{isZh ? "争议原因" : "Reason"}:</strong>{" "}
                      {dispute.reason}
                    </p>

                    {/* 管理员处理记录（对用户可见的状态部分，不暴露内部细节） */}
                    {dispute.adminActions.length > 0 && (
                      <>
                        <p
                          className={styles.sectionTitle}
                          style={{ fontSize: 11, margin: "10px 0 4px" }}
                        >
                          {isZh ? "处理记录" : "Admin actions"}
                        </p>
                        <ul className={styles.timeline}>
                          {dispute.adminActions.map((action, i) => (
                            <li key={i} className={styles.timelineItem}>
                              <span className={styles.timelineTime}>
                                {formatTime(action.at, locale)}
                              </span>
                              {action.summary}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
