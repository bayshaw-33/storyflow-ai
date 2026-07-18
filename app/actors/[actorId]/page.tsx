"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, TriangleAlert, UserRoundX } from "lucide-react";
import { ActorAssetPacks } from "@/components/actors/ActorAssetPacks";
import { ActorProfilePanel } from "@/components/actors/ActorProfilePanel";
import { PortrayalGallery } from "@/components/actors/PortrayalGallery";
import { ReferenceSheetExport } from "@/components/actors/ReferenceSheetExport";
import { actorApiFetch } from "@/components/actors/actor-client";
import { actorLibraryCopy } from "@/components/actors/actor-copy";
import {
  groupVersionsByPack,
  mergeVersions,
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

type ActorListPayload = { actors: ActorProfile[] };

// 演员详情页：左侧人物设定，右侧图片资产（两个版本三视图 / 表情组 / 身体细节）+ 参演作品。
export default function ActorDetailPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const ui = actorLibraryCopy[isZh ? "zh" : "en"];
  const params = useParams<{ actorId: string }>();
  const actorId = typeof params?.actorId === "string" ? params.actorId : "";
  const { session, sessionLoaded } = useActorSession();
  const token = session?.access_token || "";

  const [actor, setActor] = useState<ActorProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState("");

  const [versionsByPack, setVersionsByPack] = useState<Record<string, ViewVersion[]>>({});
  const [packBusy, setPackBusy] = useState("");
  const [packErrors, setPackErrors] = useState<Record<string, string>>({});
  const [historyFailed, setHistoryFailed] = useState(false);

  const [portrayals, setPortrayals] = useState<PortrayalLike[]>([]);
  const [portrayalsLoading, setPortrayalsLoading] = useState(false);
  const [portrayalsError, setPortrayalsError] = useState("");

  useEffect(() => {
    if (!token || !actorId) return;
    let active = true;
    setLoading(true);
    setError("");
    setNotFound(false);
    void (async () => {
      try {
        const result = await actorApiFetch<ActorListPayload>("/api/actors", token);
        if (!active) return;
        const found = (result.actors || []).find((item) => item.id === actorId) || null;
        setActor(found);
        setNotFound(!found);
      } catch (issue) {
        if (!active) return;
        setError(issue instanceof Error ? issue.message : ui.detailError);
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
        const result = await actorApiFetch<{ versions?: unknown }>(`/api/actors/generate-views?actorId=${encodeURIComponent(actorId)}`, token);
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

  // 参演作品。
  useEffect(() => {
    if (!token || !actorId) return;
    let active = true;
    setPortrayalsLoading(true);
    setPortrayalsError("");
    void (async () => {
      try {
        const result = await actorApiFetch<unknown>(`/api/actors/portrayals?actorId=${encodeURIComponent(actorId)}`, token);
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
        const incoming = normalizeViewVersions(result).map((version) => ({ ...version, pack: version.pack || pack }));
        if (!incoming.length) throw new Error(isZh ? "端点未返回图片版本。" : "Endpoint returned no versions.");
        setVersionsByPack((current) => ({
          ...current,
          [pack]: mergeVersions(current[pack] || [], incoming.filter((version) => version.pack === pack)),
        }));
        setHistoryFailed(false);
      } catch (issue) {
        // 降级态：保留已有图片，仅提示失败原因。
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

  const sheetSelection = useMemo(
    () => selectReferenceSheetImages({ avatarUrl: actor?.avatar_url, versionsByPack }),
    [actor?.avatar_url, versionsByPack],
  );
  const sheetTags = useMemo(() => {
    if (!actor) return [];
    return [...normalizeTagList(actor.temperament), ...normalizeTagList(actor.playable_roles)].slice(0, 6);
  }, [actor]);

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
            <span className={styles.badge}>{actor.status === "ready" ? ui.statusReady : ui.statusDraft}</span>
          </>
        ) : null}
        <span className={styles.topbarSpacer} />
        {actor ? <ReferenceSheetExport actorName={actor.name} tags={sheetTags} selection={sheetSelection} copy={ui} /> : null}
      </header>

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
      ) : error ? (
        <section className={styles.statePanel}>
          <TriangleAlert size={22} color="#ffb1b3" />
          <h2>{ui.detailError}</h2>
          <p>{error}</p>
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
              historyFailed={historyFailed}
              onGenerate={(pack) => void generatePack(pack)}
            />
            <PortrayalGallery copy={ui} portrayals={portrayals} loading={portrayalsLoading} error={portrayalsError} />
          </div>
        </div>
      )}
    </main>
  );
}
