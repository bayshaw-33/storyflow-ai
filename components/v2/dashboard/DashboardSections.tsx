"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Clock,
  FileText,
  Globe2,
  Loader2,
  Package,
  Pencil,
  Plus,
  Sparkles,
} from "lucide-react";
import styles from "./dashboard.module.css";
import { useI18n } from "@/lib/i18n/useI18n";
import type {
  PendingConfirmation,
  PendingConfirmationType,
  RecentProject,
  RecentUniverse,
  RecentWork,
  RunningJob,
  RunningJobStage,
} from "@/lib/client/v2/dashboard/types";
import type { DashboardWorkflowType } from "@/lib/client/v2/dashboard/types";
import {
  resolveJobDetailUrl,
  resolveProjectWorkbenchRoute,
} from "@/lib/client/v2/navigation/resolver";

function formatRelative(iso: string, isZh: boolean): string {
  const ts = new Date(iso).getTime();
  if (Number.isNaN(ts)) return iso;
  const diff = Date.now() - ts;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return isZh ? "刚刚" : "just now";
  if (diff < hour) return isZh ? `${Math.floor(diff / minute)} 分钟前` : `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return isZh ? `${Math.floor(diff / hour)} 小时前` : `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return isZh ? `${Math.floor(diff / day)} 天前` : `${Math.floor(diff / day)}d ago`;
  return new Date(ts).toLocaleDateString(isZh ? "zh-CN" : "en-US");
}

function formatElapsed(ms: number, isZh: boolean): string {
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return isZh ? `${sec} 秒` : `${sec}s`;
  const min = Math.floor(sec / 60);
  const rem = sec % 60;
  if (min < 60) return isZh ? `${min} 分 ${rem} 秒` : `${min}m ${rem}s`;
  const hr = Math.floor(min / 60);
  return isZh ? `${hr} 时 ${min % 60} 分` : `${hr}h ${min % 60}m`;
}

const WORKFLOW_LABELS: Record<DashboardWorkflowType, string> = {
  script: "剧本",
  creation: "原创剧本",
  continuation: "续作剧本",
  song: "歌曲",
  art: "美术",
  viral: "短视频改编",
  storyboard: "分镜",
  video: "视频",
  voice: "配音",
  editing: "剪辑",
};

const CONFIRMATION_LABELS: Record<PendingConfirmationType, string> = {
  change_proposal: "变更候选",
  canon_check: "Canon 校验",
  asset_review: "资产审核",
};

const JOB_STAGE_LABELS: Record<RunningJobStage, string> = {
  draft: "草稿",
  pending_confirm: "待确认",
  queued: "排队中",
  generating: "生成中",
  result_ingesting: "结果入库",
  completed: "已完成",
  partial_failure: "部分失败",
  failed: "已失败",
  cancelled: "已取消",
};

function stageBadgeClass(stage: RunningJobStage): string {
  if (stage === "completed") return styles.badgeOk;
  if (stage === "failed" || stage === "partial_failure" || stage === "cancelled") return styles.badgeDanger;
  if (stage === "queued" || stage === "pending_confirm") return styles.badgeWarn;
  return styles.badgeAccent;
}

// 继续创作：最近项目卡片，点击直接进入对应工作台。
export function ContinueCreatingSection({ projects }: { projects: RecentProject[] }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <Pencil size={16} />
          {isZh ? "继续创作" : "Continue"}
        </h2>
        <span className={styles.cardCount}>
          {isZh ? `${projects.length} 个项目` : `${projects.length} project(s)`}
        </span>
      </div>
      {projects.length === 0 ? (
        <div className={styles.noticeEmpty}>
          {isZh ? "暂无最近项目。" : "No recent projects."}
        </div>
      ) : (
        <ul className={styles.list}>
          {projects.map((project) => {
            const target = resolveProjectWorkbenchRoute(project.workflowType, { projectId: project.id });
            return (
            <li key={project.id}>
              <Link href={target} className={`${styles.row} ${styles.rowClickable}`}>
                <div className={styles.rowTop}>
                  <span className={styles.rowTitle}>{project.title}</span>
                  <span className={styles.badge}>{WORKFLOW_LABELS[project.workflowType]}</span>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.rowMetaItem}>
                    <Sparkles size={12} />
                    {project.currentStage}
                  </span>
                  <span className={styles.rowMetaItem}>
                    <Clock size={12} />
                    {isZh ? "自动保存 " : "saved "}
                    {formatRelative(project.lastSavedAt, isZh)}
                  </span>
                  {project.universeBound ? (
                    <span className={`${styles.badge} ${styles.badgeAccent}`}>
                      <Globe2 size={11} />
                      {isZh ? "已绑定 Universe" : "Universe bound"}
                    </span>
                  ) : (
                    <span className={styles.badge}>{isZh ? "未绑定 Universe" : "Universe unbound"}</span>
                  )}
                </div>
              </Link>
            </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// 等待确认：Change Proposal / Canon Check / 资产审核。
export function PendingConfirmationsSection({ items }: { items: PendingConfirmation[] }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <Bell size={16} />
          {isZh ? "等待确认" : "Pending"}
        </h2>
        <span className={styles.cardCount}>
          {isZh ? `${items.length} 项` : `${items.length} item(s)`}
        </span>
      </div>
      {items.length === 0 ? (
        <div className={styles.noticeEmpty}>
          {isZh ? "没有待确认项。" : "Nothing pending."}
        </div>
      ) : (
        <ul className={styles.list}>
          {items.map((item) => (
            <li key={item.id} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.rowTitle}>{item.title}</span>
                <span className={`${styles.badge} ${item.confidence >= 0.85 ? styles.badgeOk : styles.badgeWarn}`}>
                  {CONFIRMATION_LABELS[item.type]}
                </span>
              </div>
              <div className={styles.rowMeta}>
                <span className={styles.rowMetaItem}>
                  <Globe2 size={12} />
                  {item.universeId}
                </span>
                <span className={styles.rowMetaItem}>
                  {isZh ? "置信度 " : "confidence "}
                  {Math.round(item.confidence * 100)}%
                </span>
                <span className={styles.rowMetaItem}>
                  <Clock size={12} />
                  {formatRelative(item.createdAt, isZh)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 运行中任务：点击跳转所属项目工作台（K21-P0-NAV-002）。
export function RunningJobsSection({ jobs }: { jobs: RunningJob[] }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const router = useRouter();
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <Loader2 size={16} />
          {isZh ? "运行中任务" : "Running"}
        </h2>
        <Link href="/job-center" className={styles.cardLink}>
          {isZh ? "前往任务中心" : "Job center"} <ArrowRight size={11} />
        </Link>
      </div>
      {jobs.length === 0 ? (
        <div className={styles.noticeEmpty}>
          {isZh ? "当前没有运行中任务。" : "No running jobs."}
        </div>
      ) : (
        <ul className={styles.list}>
          {jobs.map((job) => {
            const percent = job.total > 0 ? Math.min(100, Math.round((job.completed / job.total) * 100)) : 0;
            const target = resolveJobDetailUrl(job.id);
            const handleClick = () => {
              router.push(target);
            };
            return (
              <li
                key={job.id}
                className={`${styles.row} ${styles.rowClickable}`}
                onClick={handleClick}
                role="link"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleClick();
                  }
                }}
              >
                <div className={styles.rowTop}>
                  <span className={styles.rowTitle}>{job.name}</span>
                  <span className={`${styles.badge} ${stageBadgeClass(job.stage)}`}>
                    {JOB_STAGE_LABELS[job.stage]}
                  </span>
                </div>
                <div className={styles.rowMeta}>
                  <span className={styles.rowMetaItem}>{job.projectName}</span>
                  <span className={styles.rowMetaItem}>
                    {isZh ? "进度 " : "progress "}
                    {job.completed}/{job.total}
                  </span>
                  <span className={styles.rowMetaItem}>
                    <Clock size={12} />
                    {formatElapsed(job.elapsedMs, isZh)}
                  </span>
                </div>
                <div className={styles.progress} aria-hidden>
                  <div className={styles.progressBar} style={{ width: `${percent}%` }} />
                </div>
                {job.estimatedRangeMs && (
                  <div className={styles.rowDesc}>
                    {isZh
                      ? `预计还需 ${formatElapsed(job.estimatedRangeMs.min, isZh)} ~ ${formatElapsed(job.estimatedRangeMs.max, isZh)}（置信度 ${Math.round(job.estimatedRangeMs.confidence * 100)}%）`
                      : `ETA ${formatElapsed(job.estimatedRangeMs.min, isZh)} ~ ${formatElapsed(job.estimatedRangeMs.max, isZh)} (${Math.round(job.estimatedRangeMs.confidence * 100)}%)`}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// Universe 健康度六维度，对齐 PRD §7.8（不使用单一总分）。
export function RecentUniversesSection({ universes }: { universes: RecentUniverse[] }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <Globe2 size={16} />
          {isZh ? "最近 Universe" : "Universes"}
        </h2>
        <Link href="/universes" className={styles.cardLink}>
          {isZh ? "全部" : "All"} <ArrowRight size={11} />
        </Link>
      </div>
      {universes.length === 0 ? (
        <div className={styles.noticeEmpty}>
          {isZh ? "暂无活跃 Universe。" : "No active universes."}
        </div>
      ) : (
        <ul className={styles.list}>
          {universes.map((uni) => {
            const h = uni.healthSummary;
            return (
              <li key={uni.id}>
                <Link href={`/universes/${encodeURIComponent(uni.id)}`} className={`${styles.row} ${styles.rowClickable}`}>
                  <div className={styles.rowTop}>
                    <span className={styles.rowTitle}>{uni.name}</span>
                    <span className={styles.badge}>
                      <Clock size={11} />
                      {formatRelative(uni.updatedAt, isZh)}
                    </span>
                  </div>
                  <div className={styles.healthRow}>
                    <span className={styles.healthItem}>
                      <span>{isZh ? "Canon 完整性" : "Canon"}</span>
                      <span className={styles.healthValue}>{Math.round(h.canonCompleteness * 100)}%</span>
                    </span>
                    <span className={styles.healthItem}>
                      <span>{isZh ? "角色完整度" : "Characters"}</span>
                      <span className={styles.healthValue}>{Math.round(h.characterCompleteness * 100)}%</span>
                    </span>
                    <span className={styles.healthItem}>
                      <span>{isZh ? "关系时间线" : "Relations"}</span>
                      <span className={styles.healthValue}>{Math.round(h.relationshipTimeline * 100)}%</span>
                    </span>
                    <span className={styles.healthItem}>
                      <span>{isZh ? "资产覆盖" : "Assets"}</span>
                      <span className={styles.healthValue}>{Math.round(h.assetCoverage * 100)}%</span>
                    </span>
                    <span className={styles.healthItem}>
                      <span>{isZh ? "待处理候选" : "Pending"}</span>
                      <span className={styles.healthValue}>{h.pendingProposals}</span>
                    </span>
                    <span className={styles.healthItem}>
                      <span>{isZh ? "冲突" : "Conflicts"}</span>
                      <span className={h.conflicts > 0 ? styles.badgeDanger : styles.healthValue}>{h.conflicts}</span>
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// 最近作品：导出或完成的。
export function RecentWorksSection({ works }: { works: RecentWork[] }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <Package size={16} />
          {isZh ? "最近作品" : "Recent works"}
        </h2>
        <Link href="/archive" className={styles.cardLink}>
          {isZh ? "归档" : "Archive"} <ArrowRight size={11} />
        </Link>
      </div>
      {works.length === 0 ? (
        <div className={styles.noticeEmpty}>
          {isZh ? "暂无作品。" : "No works yet."}
        </div>
      ) : (
        <ul className={styles.list}>
          {works.map((work) => (
            <li key={work.id} className={styles.row}>
              <div className={styles.rowTop}>
                <span className={styles.rowTitle}>
                  <FileText size={13} />
                  {work.title}
                </span>
                <span className={`${styles.badge} ${work.status === "released" ? styles.badgeOk : styles.badgeAccent}`}>
                  {work.status}
                </span>
              </div>
              <div className={styles.rowMeta}>
                <span className={styles.rowMetaItem}>{work.type}</span>
                <span className={styles.rowMetaItem}>
                  <Clock size={12} />
                  {formatRelative(work.exportedAt, isZh)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// 快速开始：新建项目跳转 /projects/new-v2（Phase 0 八模块入口方格）。
export function QuickStartSection() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <section className={styles.card}>
      <div className={styles.cardHeader}>
        <h2 className={styles.cardTitle}>
          <Plus size={16} />
          {isZh ? "快速开始" : "Quick start"}
        </h2>
      </div>
      <p className={styles.rowDesc} style={{ marginTop: 0, marginBottom: 12 }}>
        {isZh
          ? "选择一个创作模块，系统会原子性地建立项目与对应工作台，Universe 可以后续绑定。"
          : "Pick a module — a project and its workbench are created atomically. Universe can be bound later."}
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Link href="/projects/new-v2" className={`${styles.button} ${styles.buttonPrimary}`}>
          <Plus size={14} />
          {isZh ? "新建项目" : "New project"}
        </Link>
        <Link href="/universes" className={styles.button}>
          <Globe2 size={14} />
          {isZh ? "打开 Universe" : "Open Universe"}
        </Link>
      </div>
    </section>
  );
}

// 下一步建议：清晰的提示。
export function NextStepHint({ hint }: { hint: string }) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  if (!hint) return null;
  return (
    <section className={`${styles.hint} ${styles.spanFull}`}>
      <AlertTriangle size={18} className={styles.hintIcon} />
      <div>
        <span className={styles.hintLabel}>
          {isZh ? "下一步建议" : "Next step"}
        </span>
        <p className={styles.hintText}>{hint}</p>
      </div>
    </section>
  );
}

// KK 浮动入口：固定在右下角。
export function KKEntrySection() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  return (
    <Link
      href="/kk"
      className={styles.kkFab}
      aria-label={isZh ? "打开 KK" : "Open KK"}
      title={isZh ? "KK 指挥助手" : "KK companion"}
    >
      <span className={styles.kkFabLabel}>KK</span>
    </Link>
  );
}
