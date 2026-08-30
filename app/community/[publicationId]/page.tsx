import Link from "next/link";
import { ArrowLeft, ArrowUpRight, CalendarDays, Layers3 } from "lucide-react";
import { getViewerFromCookies, hasServiceRoleConfig, serviceFetch } from "@/lib/supabase/server";
import { getCommunityPublicationDetail } from "@/lib/server/v2/community/discovery";
import { computeAllowedActions } from "@/lib/contracts/v2/community";
import { getCommunityContentLabel, getPublicationObjectHref } from "@/lib/client/v2/community/view-model";
import { CommunityInteractionPanel } from "@/components/v2/community/CommunityInteractionPanel";
import { CommunityReturnActions } from "@/components/v2/community/CommunityReturnActions";
import { resolvePublicationReuseCapabilities } from "@/lib/server/v2/community/reuse";
import styles from "../community.module.css";

export const dynamic = "force-dynamic";

export default async function CommunityPublicationPage({
  params,
}: {
  params: Promise<{ publicationId: string }>;
}) {
  if (!hasServiceRoleConfig()) {
    return <main className={`cosmic-page ${styles.detailShell}`}><DetailUnavailable /></main>;
  }

  const { publicationId } = await params;
  const detail = await getCommunityPublicationDetail(serviceFetch, publicationId);
  const publication = detail?.publication ?? null;
  const viewer = await getViewerFromCookies();
  if (!detail || !publication || (!viewer && (publication.visibility !== "public" || publication.status !== "active"))) {
    return <main className={`cosmic-page ${styles.detailShell}`}><DetailUnavailable notFound /></main>;
  }

  const kind = detail.context.subjectType;
  const objectHref = getPublicationObjectHref({ ...publication, ...detail.context });
  const capability = (await resolvePublicationReuseCapabilities(serviceFetch, [{
    id: publication.id,
    source_type: publication.sourceType,
    source_id: publication.sourceId,
    publisher_id: publication.publisherId,
    work_id: detail.context.workId,
  }], viewer?.id ?? null)).get(publication.id)!;
  const allowedActions = computeAllowedActions(publication, viewer?.id ?? null, { reuseCapability: capability });

  return (
    <main className={`cosmic-page ${styles.detailShell}`}>
      <div className={styles.detailTopbar}>
        <Link href="/community" className={styles.backLink}>
          <ArrowLeft size={15} />
          返回社区
        </Link>
        <span className={styles.detailContract}>PUBLICATION / {publication.sourceVersion || "LATEST"}</span>
      </div>

      <article className={styles.detailCard}>
        <div className={styles.detailMedia}>
          {publication.coverUrl ? <img src={publication.coverUrl} alt={publication.title} /> : <Layers3 size={40} />}
        </div>
        <div className={styles.detailBody}>
          <div className={styles.detailEyebrow}>
            <span>{getCommunityContentLabel(kind, "zh-CN")}</span>
            <span>{publication.visibility === "public" ? "公开" : "受限"}</span>
          </div>
          <h1>{publication.title}</h1>
          {publication.summary ? <p className={styles.detailSummary}>{publication.summary}</p> : null}
          <div className={styles.detailMeta}>
            <span><CalendarDays size={14} />{formatDate(publication.createdAt)}</span>
            <span>创作者 · {publication.publisherId.slice(0, 8)}</span>
          </div>
          <div className={styles.detailSourceBlock}>
            <span className={styles.panelKicker}>SOURCE CONTEXT</span>
            {objectHref ? (
              <Link href={objectHref} className={styles.detailSourceLink}>
                {sourceLabel(publication.sourceType)} · {publication.sourceId}
                <ArrowUpRight size={14} />
              </Link>
            ) : (
              <span className={styles.detailSourceLinkMuted}>这个来源对象暂时没有可用的公开入口。</span>
            )}
            <div className={styles.detailContextSummary}>
              <span>来源工作台 · {detail.context.sourceWorkbench}</span>
              <span>权利 · {detail.context.rightsSummary || "权利状态未声明"}</span>
              <span>贡献 · {detail.context.contributionSummary || "暂无贡献记录"}</span>
            </div>
          </div>
        </div>
      </article>
      <CommunityReturnActions
        allowedActions={allowedActions}
        sourceType={publication.sourceType}
        sourceHref={objectHref}
        publicationId={publication.id}
        reuseCapability={capability}
      />
      <CommunityInteractionPanel
        publicationId={publication.id}
        viewerId={viewer?.id ?? null}
        canComment={allowedActions.includes("comment")}
      />
    </main>
  );
}

function DetailUnavailable({ notFound = false }: { notFound?: boolean }) {
  return (
    <section className={styles.detailUnavailable} role="status">
      <span className={styles.unavailableKicker}>COMMUNITY OBJECT</span>
      <h1>{notFound ? "这个公开对象不存在" : "社区对象暂时无法加载"}</h1>
      <p>{notFound ? "它可能已撤回，或你没有访问权限。" : "请稍后返回社区重试。"}</p>
      <Link href="/community" className={styles.retryButton}>返回社区</Link>
    </section>
  );
}

function sourceLabel(sourceType: string): string {
  if (sourceType === "universe") return "Universe";
  if (sourceType === "actor") return "演员市场";
  if (sourceType === "asset") return "资产市场";
  if (sourceType === "project") return "项目工作台";
  return "来源对象";
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
