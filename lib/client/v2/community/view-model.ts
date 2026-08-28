import type { Locale } from "@/lib/i18n/dictionaries";
import type { PublicationSourceType, PublicationSubject } from "@/lib/contracts/v2/community";
import { isWorkType, type WorkType } from "../../../contracts/v2/work.ts";
import { resolveWorkbenchRoute } from "../navigation/resolver.ts";

export const COMMUNITY_SECTIONS = [
  { id: "recommended", labelZh: "推荐", labelEn: "Discover" },
  { id: "following", labelZh: "关注", labelEn: "Following" },
  { id: "universes", labelZh: "Universe", labelEn: "Universes" },
  { id: "works", labelZh: "作品", labelEn: "Works" },
  { id: "actors", labelZh: "演员与声音", labelEn: "Actors & voices" },
  { id: "assets", labelZh: "素材", labelEn: "Assets" },
  { id: "saved", labelZh: "我的收藏", labelEn: "Saved" },
] as const;

export type CommunitySectionId = (typeof COMMUNITY_SECTIONS)[number]["id"];
export type CommunityContentKind = PublicationSubject;

export type CommunityReturnActionId = "apply_use" | "remix" | "license";

export interface CommunityReturnAction {
  id: CommunityReturnActionId;
  enabled: boolean;
  href?: string;
  reason?: string;
}

export function getCommunityContentKind(
  sourceType: PublicationSourceType | CommunityContentKind,
): CommunityContentKind {
  if (sourceType === "work" || sourceType === "milestone" || sourceType === "kk_showcase") return sourceType;
  if (sourceType === "universe") return "universe";
  if (sourceType === "actor") return "actor";
  if (sourceType === "asset") return "asset";
  return "work";
}

export function getCommunityContentLabel(
  kind: CommunityContentKind,
  locale: Locale,
): string {
  if (locale === "zh-CN") {
    return {
      universe: "Universe",
      work: "作品",
      actor: "演员",
      asset: "素材",
      milestone: "里程碑",
      kk_showcase: "KK 展示",
    }[kind];
  }
  return {
    universe: "Universe",
    work: "Work",
    actor: "Actor",
    asset: "Asset",
    milestone: "Milestone",
    kk_showcase: "KK Showcase",
  }[kind];
}

export function getPublicationObjectHref(input: {
  sourceType: PublicationSourceType;
  sourceId: string;
  subjectType?: CommunityContentKind;
  projectId?: string | null;
  workId?: string | null;
  workType?: string | null;
}): string | null {
  const kind = input.subjectType ?? getCommunityContentKind(input.sourceType);
  if (kind === "work") {
    const projectId = input.projectId || (input.sourceType === "project" ? input.sourceId : null);
    if (!projectId || !isWorkType(input.workType)) return null;
    return resolveWorkbenchRoute(input.workType as WorkType, {
      projectId,
      workId: input.workId,
    });
  }
  const sourceId = encodeURIComponent(input.sourceId);
  switch (input.sourceType) {
    case "universe":
      return `/universes/${sourceId}`;
    case "actor":
      return `/actors/${sourceId}`;
    case "asset":
      return `/business/marketplace/${sourceId}`;
    default:
      return null;
  }
}

export function getPublicationDetailHref(publicationId: string): string {
  return `/community/${encodeURIComponent(publicationId)}`;
}

export function getPublicationReturnActions(input: {
  allowedActions: readonly string[];
  sourceType: PublicationSourceType;
  sourceHref: string | null;
}): ReadonlyArray<CommunityReturnAction> {
  const canEnterSource = Boolean(input.sourceHref);
  return [
    {
      id: "apply_use",
      enabled: canEnterSource && input.allowedActions.includes("apply_use"),
      href: canEnterSource ? input.sourceHref ?? undefined : undefined,
      reason: canEnterSource ? undefined : "缺少真实来源入口，暂不能申请使用。",
    },
    {
      id: "remix",
      enabled: false,
      reason: input.allowedActions.includes("remix")
        ? "改编入口正在等待源对象确认。"
        : "当前权利摘要没有返回可用的改编授权。",
    },
    {
      id: "license",
      enabled: false,
      reason: input.sourceType === "asset"
        ? "当前 publication 没有返回可用的授权 offer。"
        : "只有带真实授权 offer 的素材可以进入授权流程。",
    },
  ];
}

export function getCommunitySectionLabel(
  section: CommunitySectionId,
  locale: Locale,
): string {
  const config = COMMUNITY_SECTIONS.find((item) => item.id === section);
  return locale === "zh-CN" ? config?.labelZh ?? "推荐" : config?.labelEn ?? "Discover";
}
