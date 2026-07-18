"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, ArrowLeft, Pencil, TriangleAlert, UserRoundX } from "lucide-react";
import { ActorAssetPacks } from "@/components/actors/ActorAssetPacks";
import { ActorProfilePanel } from "@/components/actors/ActorProfilePanel";
import { EditActorModal } from "@/components/actors/EditActorModal";
import { PortrayalGallery } from "@/components/actors/PortrayalGallery";
import { ReferenceSheetExport } from "@/components/actors/ReferenceSheetExport";
import { actorApiFetch } from "@/components/actors/actor-client";
import { actorLibraryCopy, type ActorLibraryCopy } from "@/components/actors/actor-copy";
import {
  computeProfileCompleteness,
  groupVersionsByPack,
  markVersionPrimary,
  mergeVersions,
  normalizeActorDetail,
  normalizePortrayals,
  normalizeTagList,
  normalizeViewVersions,
  type PortrayalLike,
  type ViewPackId,
  type ViewVersion,
} from "@/components/actors/actor-view-model";
import { selectReferenceSheetImages } from "@/components/actors/reference-sheet-plan";
import { useActorSession } from "@/components/actors/use-actor-session";
import styles from "@/components/actors/actors.module.css";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ActorProfile } from "@/lib/actors";

// 演员详情页：
// PRD §7.2 顶部身份区 + 左侧人物设定 + 右侧图片资产（带版本/主版本/历史）+ 参演作品。
// 关键：使用 GET /api/actors/:actorId 单读，不再请求整个列表后客户端查找。
export default function ActorDetailPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const ui = actorLibraryCopy[isZh ? "zh" : "en"];
  const params = useParams<{ actorId: string }>();
  const actorId = typeof params?.actorId === "string" ? params.actorId : "";
  const router = useRouter();
  const { session, sessionLoaded } = useActorSession();
  const token = session?.access_token || "";

  const [actor, setActor] = useState<ActorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");
  const [portrayalCount, setPortrayalCount] = useState(0);

  const [versionsByPack, setVersionsByPack] = useState<Record<string, ViewVersion[]>>({});
  const [packBusy, setPackBusy] = useState("");
  const [packErrors, setPackErrors] = useState<Record<string, string>>({});
  const [versionErrors, setVersionErrors] = useState<Record<string, string>>({});
  const [historyFailed, setHistoryFailed] = useState(false);

  const [portrayals, setPortrayals] = useState<PortrayalLike[]>([]);
  const [portrayalsLoading, setPortrayalsLoading] = useState(false);
  const [portrayalsError, setPortrayalsError] = useState("");

  const [archiving, setArchiving] = useState(false);
  const [archiveError, setArchiveError] = useState("");
  const [editModalOpen, setEditModalOpen] = useState(false);

  // PRD §7.2 关键约束：详情页必须用 GET /api/actors/:actorId 单读。
  useEffect(() => {
    if (!token || !actorId) return;
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    void (async () => {
      try {
        const result = await actorApiFetch<{ actor: unknown; requestId?: string }>(
          `/api/actors/${encodeURIComponent(actorId)}`,
          token,
        );
        if (!active) return;
        const detail = normalizeActorDetail(result);
        if (!detail) {
          setActor(null);
          setNotFound(true);
        } else {
          // 详情端点返回完整 ActorProfile 字段；用类型断言把 ActorDetail 视作 ActorProfile。
          setActor(detail as unknown as ActorProfile);
          setPortrayalCount(typeof detail.portrayalCount === "number" ? detail.portrayalCount : 0);
        }
      } catch (issue) {
        if (!active) return;
        const message = issue instanceof Error ? issue.message : ui.detailError;
        // 404 / 403 在 actor-client 中以 ActorApiError.status 暴露
        const status = (issue as { status?: number }).status;
        if (status === 404) setNotFound(true);
        setError(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, actorId, ui.detailError]);

  // 读取 generate-views 历史版本：端点由后端伙伴并行开发，失败时静默降级为空资产区。
  useEffect(() => {
    if (!token || !actorId) return;
    let active = true;
    void (async () => {
      try {
        const result = await actorApiFetch<{ versions?: unknown }>(
          `/api/actors/generate-views?actorId=${encodeURIComponent(actorId)}`,
          token,
        );
        if (!active) return;
        const versions = normalizeViewVersions(result);
        if (versions.length) setVersionsByPack(groupVersionsByPack(versions));
        setHistoryFailed(false);
      } catch {
        if (active) setHistoryFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, actorId]);

  // 参演作品：GET /api/actors/portrayals?actorId=X
  useEffect(() => {
    if (!token || !actorId) return;
    let active = true;
    setPortrayalsLoading(true);
    setPortrayalsError("");
    void (async () => {
      try {
        const result = await actorApiFetch<unknown>(
          `/api/actors/portrayals?actorId=${encodeURIComponent(actorId)}`,
          token,
        );
        if (!active) return;
        setPortrayals(normalizePortrayals(result));
      } catch (issue) {
        if (!active) return;
        setPortrayalsError(issue instanceof Error ? issue.message : "");
      } finally {
        if (active) setPortrayalsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, actorId]);

  const generatePack = useCallback(
    async (pack: ViewPackId) => {
      if (!token || !actorId || packBusy) return;
      setPackBusy(pack);
      setPackErrors((current) => ({ ...current, [pack]: "" }));
      try {
        const result = await actorApiFetch<unknown>("/api/actors/generate-views", token, {
          method: "POST",
          body: JSON.stringify({ actorId, pack }),
        });
        const incoming = normalizeViewVersions(result).map((version) => ({
          ...version,
          pack: version.pack || pack,
        }));
        if (!incoming.length) {
          throw new Error(isZh ? "端点未返回图片版本。" : "Endpoint returned no versions.");
        }
        // PRD §7.2 关键：单张失败不清空其他版本，mergeVersions 保留旧版本。
        setVersionsByPack((current) => ({
          ...current,
          [pack]: mergeVersions(current[pack] || [], incoming.filter((version) => version.pack === pack)),
        }));
        setHistoryFailed(false);
      } catch (issue) {
        setPackErrors((current) => ({
          ...current,
          [pack]: issue instanceof Error ? issue.message : isZh ? "生成失败。" : "Generation failed.",
        }));
      } finally {
        setPackBusy("");
      }
    },
    [token, actorId, packBusy, isZh],
  );

  // PRD §7.2 主版本持久化：调用 PATCH /api/actors/:actorId/primary-version
  // 失败时保留旧状态并提示错误，不静默丢失用户操作。
  const [primaryError, setPrimaryError] = useState("");
  const handleSetPrimary = useCallback(
    async (pack: ViewPackId, versionId: string) => {
      if (!token || !actorId) return;
      setPrimaryError("");
      try {
        await actorApiFetch(`/api/actors/${encodeURIComponent(actorId)}/primary-version`, token, {
          method: "PATCH",
          body: JSON.stringify({ versionId }),
        });
        setVersionsByPack((current) => ({
          ...current,
          [pack]: markVersionPrimary(current[pack] || [], versionId),
        }));
      } catch (issue) {
        setPrimaryError(issue instanceof Error ? issue.message : isZh ? "主版本持久化失败，请重试。" : "Failed to persist primary version.");
      }
    },
    [token, actorId, isZh],
  );

  const handleArchive = useCallback(async () => {
    if (!token || !actorId || archiving) return;
    if (!window.confirm(isZh ? "归档该演员？已生成的资产会保留，但不再出现在名册中。" : "Archive this actor? Generated assets stay, but the actor leaves the roster.")) {
      return;
    }
    setArchiving(true);
    setArchiveError("");
    try {
      await actorApiFetch(`/api/actors?id=${encodeURIComponent(actorId)}`, token, { method: "DELETE" });
      router.push("/actors");
    } catch (issue) {
      setArchiveError(issue instanceof Error ? issue.message : isZh ? "归档失败。" : "Archive failed.");
    } finally {
      setArchiving(false);
    }
  }, [token, actorId, archiving, isZh, router]);

  const sheetSelection = useMemo(
    () => selectReferenceSheetImages({ avatarUrl: actor?.avatar_url, versionsByPack }),
    [actor?.avatar_url, versionsByPack],
  );
  const sheetTags = useMemo(() => {
    if (!actor) return [];
    return [...normalizeTagList(actor.temperament), ...normalizeTagList(actor.playable_roles)].slice(0, 6);
  }, [actor]);

  const completeness = useMemo(() => {
    if (!actor) return { percent: 0, filled: 0, total: 10 };
    return computeProfileCompleteness(actor);
  }, [actor]);

  const playableTypes = useMemo(() => {
    if (!actor) return [];
    return normalizeTagList(actor.playable_roles).slice(0, 4);
  }, [actor]);

  // PRD §权限矩阵：基础资料编辑仅创建者可写
  const isCreator = Boolean(actor && session?.user?.id && actor.owner_id === session.user.id);
  const authRequired = sessionLoaded && !session;

  return (
    <main className={styles.page}>
      <header className={styles.detailTopbar}>
        <Link className={styles.backLink} href="/actors">
          <ArrowLeft size={15} />
          {ui.backToLibrary}
        </Link>
        {actor ? (
          <>
            <h1 className={styles.detailName}>{actor.name}</h1>
            <span className={actor.visibility === "team" ? `${styles.badge} ${styles.badgeAccent}` : styles.badge}>
              {actor.visibility === "team" ? ui.teamBadge : ui.privateBadge}
            </span>
            <span className={actor.status === "ready" ? `${styles.badge} ${styles.badgeReady}` : `${styles.badge} ${styles.badgeDraft}`}>
              {actor.status === "ready" ? ui.statusReady : ui.statusDraft}
            </span>
          </>
        ) : null}
        <span className={styles.topbarSpacer} />
        {actor ? (
          <span className={styles.detailActions}>
            {isCreator ? (
              <button
                className={styles.ghostBtn}
                type="button"
                onClick={() => setEditModalOpen(true)}
                disabled={archiving}
              >
                <Pencil size={14} />
                {isZh ? "编辑" : "Edit"}
              </button>
            ) : null}
            <button
              className={styles.ghostBtn}
              type="button"
              onClick={() => void handleArchive()}
              disabled={archiving}
            >
              <Archive size={14} />
              {archiving ? (isZh ? "归档中..." : "Archiving...") : isZh ? "归档" : "Archive"}
            </button>
            <ReferenceSheetExport actorName={actor.name} tags={sheetTags} selection={sheetSelection} copy={ui} />
          </span>
        ) : null}
      </header>

      {archiveError ? (
        <div className={styles.noticeBar} role="alert">
          {archiveError}
        </div>
      ) : null}
      {primaryError ? (
        <div className={styles.noticeBar} role="alert">
          {primaryError}
        </div>
      ) : null}

      {authRequired ? (
        <section className={styles.statePanel}>
          <p className={styles.kicker}>{ui.authKicker}</p>
          <h2>{ui.authTitle}</h2>
          <p>{ui.authBody}</p>
          <Link className={styles.primaryBtn} href="/login">
            {ui.signIn}
          </Link>
        </section>
      ) : loading ? (
        <section className={styles.gridWrap} aria-busy="true" aria-label={ui.detailLoading}>
          <div className={styles.detailLayout}>
            <div className={styles.skeletonCard} style={{ aspectRatio: "1 / 1", maxWidth: 360 }} />
            <div style={{ display: "grid", gap: 22 }}>
              <div className={styles.skeletonCard} style={{ aspectRatio: "3 / 1" }} />
              <div className={styles.skeletonCard} style={{ aspectRatio: "3 / 1" }} />
            </div>
          </div>
        </section>
      ) : error && !actor ? (
        <section className={styles.statePanel}>
          <TriangleAlert size={22} color="#ffb1b3" />
          <h2>{ui.detailError}</h2>
          <p>{error}</p>
          <button className={styles.primaryBtn} type="button" onClick={() => router.refresh()}>
            {ui.detailErrorRetry}
          </button>
        </section>
      ) : notFound || !actor ? (
        <section className={styles.statePanel}>
          <UserRoundX size={22} color="#8f999b" />
          <h2>{ui.detailNotFound}</h2>
          <Link className={styles.ghostBtn} href="/actors">
            {ui.backToLibrary}
          </Link>
        </section>
      ) : (
        <>
          <IdentityStrip
            actor={actor}
            copy={ui}
            isZh={isZh}
            portrayalCount={portrayalCount}
            playableTypes={playableTypes}
            completeness={completeness}
          />
          <div className={styles.detailLayout}>
            <ActorProfilePanel actor={actor} copy={ui} />
            <div className={styles.assetsColumn}>
              <ActorAssetPacks
                actor={actor}
                isZh={isZh}
                copy={ui}
                versionsByPack={versionsByPack}
                packBusy={packBusy}
                packErrors={packErrors}
                versionErrors={versionErrors}
                historyFailed={historyFailed}
                onGenerate={(pack) => void generatePack(pack)}
                onSetPrimary={handleSetPrimary}
              />
              <PortrayalGallery copy={ui} portrayals={portrayals} loading={portrayalsLoading} error={portrayalsError} />
            </div>
          </div>
        </>
      )}
      <EditActorModal
        open={editModalOpen}
        token={token}
        copy={ui}
        actor={actor}
        onClose={() => setEditModalOpen(false)}
        onUpdated={(updated) => {
          setActor(updated);
          setEditModalOpen(false);
        }}
      />
    </main>
  );
}

type IdentityStripProps = {
  actor: ActorProfile;
  copy: ActorLibraryCopy;
  isZh: boolean;
  portrayalCount: number;
  playableTypes: string[];
  completeness: { percent: number; filled: number; total: number };
};

function IdentityStrip({ actor, copy, isZh, portrayalCount, playableTypes, completeness }: IdentityStripProps) {
  const updatedAtText = actor.updated_at
    ? new Date(actor.updated_at).toLocaleString(isZh ? "zh-CN" : "en-US")
    : copy.notProvided;
  return (
    <section className={styles.identityStrip} aria-label={copy.identityKicker}>
      <div className={styles.identityAvatar}>
        {actor.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.avatar_url} alt={actor.name} />
        ) : (
          <span className={styles.cardInitials}>{actor.name.slice(0, 1).toUpperCase() || "A"}</span>
        )}
      </div>
      <div className={styles.identityBody}>
        <div className={styles.identityRow}>
          <span className={styles.identityName}>{actor.name}</span>
          <span className={actor.visibility === "team" ? `${styles.badge} ${styles.badgeAccent}` : styles.badge}>
            {actor.visibility === "team" ? copy.teamBadge : copy.privateBadge}
          </span>
          <span className={actor.status === "ready" ? `${styles.badge} ${styles.badgeReady}` : `${styles.badge} ${styles.badgeDraft}`}>
            {actor.status === "ready" ? copy.statusReady : copy.statusDraft}
          </span>
        </div>
        <div className={styles.identityRow}>
          <span className={styles.identityLabel}>{copy.playableTypesLabel}</span>
          {playableTypes.length ? (
            <span className={styles.tagRow}>
              {playableTypes.map((tag) => (
                <span className={styles.tag} key={tag}>
                  {tag}
                </span>
              ))}
            </span>
          ) : (
            <span className={styles.identityMeta}>{copy.notProvided}</span>
          )}
        </div>
        <div className={styles.identityRow}>
          <div className={styles.identityCompleteness}>
            <span className={styles.identityLabel}>{copy.fieldCompleteness}</span>
            <span className={styles.completenessValue}>{copy.completenessValue(completeness.filled, completeness.total, completeness.percent)}</span>
            <span className={styles.completenessBar}>
              <span className={styles.completenessFill} style={{ width: `${completeness.percent}%` }} />
            </span>
          </div>
          <span className={styles.identityMeta}>
            {copy.fieldPortrayalCount}: <strong>{portrayalCount}</strong>
          </span>
          <span className={styles.identityMeta}>
            {copy.fieldUpdatedAt}: {updatedAtText}
          </span>
        </div>
      </div>
    </section>
  );
}
