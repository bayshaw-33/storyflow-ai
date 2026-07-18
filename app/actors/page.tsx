"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ImageOff, LoaderCircle, Plus, Search, TriangleAlert, Users } from "lucide-react";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
import { ActorCard } from "@/components/actors/ActorCard";
import { CreateActorModal } from "@/components/actors/CreateActorModal";
import { actorApiFetch } from "@/components/actors/actor-client";
import { actorLibraryCopy } from "@/components/actors/actor-copy";
import { filterActors, toActorCard } from "@/components/actors/actor-view-model";
import { useActorSession } from "@/components/actors/use-actor-session";
import styles from "@/components/actors/actors.module.css";
import { useI18n } from "@/lib/i18n/useI18n";
import type { ActorProfile } from "@/lib/actors";

type ActorListPayload = {
  actors: ActorProfile[];
  storageMode?: "structured" | "project_snapshot" | "unavailable";
  warning?: string;
};

// 演员库 · 模特公司模式：全屏白底特写卡片墙，悬停显示名字 + 标签。
export default function ActorsPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const ui = actorLibraryCopy[isZh ? "zh" : "en"];
  const router = useRouter();
  const { session, sessionLoaded } = useActorSession();

  const [actors, setActors] = useState<ActorProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError("");
    try {
      const result = await actorApiFetch<ActorListPayload>("/api/actors", session.access_token);
      setActors(Array.isArray(result.actors) ? result.actors : []);
      setWarning(result.warning || (result.storageMode && result.storageMode !== "structured" ? ui.fallbackWarning : ""));
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : ui.errorTitle);
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, ui.errorTitle, ui.fallbackWarning]);

  useEffect(() => {
    if (session?.access_token) void load();
  }, [session?.access_token, load]);

  const cards = useMemo(() => filterActors(actors, query).map((actor) => toActorCard(actor)), [actors, query]);

  function handleCreated(actor: ActorProfile) {
    setCreateOpen(false);
    // 创建成功必须立即可见：先本地置顶插入，再进入详情页；后台刷新失败也不影响。
    setActors((current) => [actor, ...current.filter((item) => item.id !== actor.id)]);
    router.push(`/actors/${actor.id}`);
    void load();
  }

  const authRequired = sessionLoaded && !session;

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <Link className={styles.topbarBrand} href="/">
          <KiikisLogo compact />
        </Link>
        <div className={styles.topbarTitles}>
          <p className={styles.kicker}>{ui.listKicker}</p>
          <h1 className={styles.title}>{ui.listTitle}</h1>
          <p className={styles.subtitle}>{ui.listSubtitle}</p>
        </div>
        <span className={styles.topbarSpacer} />
        {!authRequired ? (
          <>
            <span className={styles.countNote}>
              {actors.length} {ui.actorCount}
            </span>
            <label className={styles.searchBox}>
              <Search size={14} />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ui.searchPlaceholder} aria-label={ui.searchPlaceholder} />
            </label>
            <button className={styles.primaryBtn} type="button" onClick={() => setCreateOpen(true)}>
              <Plus size={15} />
              {ui.newActor}
            </button>
          </>
        ) : null}
      </header>

      {warning ? (
        <div className={styles.noticeBar} role="status">
          <TriangleAlert size={13} style={{ verticalAlign: "-2px", marginRight: 6 }} />
          {warning}
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
        <section className={styles.gridWrap} aria-busy="true" aria-label={ui.loading}>
          <ul className={styles.grid}>
            {Array.from({ length: 10 }, (_, index) => (
              <li key={index}>
                <div className={styles.skeletonCard} />
              </li>
            ))}
          </ul>
        </section>
      ) : error ? (
        <section className={styles.statePanel}>
          <TriangleAlert size={22} color="#ffb1b3" />
          <h2>{ui.errorTitle}</h2>
          <p>{error}</p>
          <button className={styles.primaryBtn} type="button" onClick={() => void load()}>
            {ui.retry}
          </button>
        </section>
      ) : !actors.length ? (
        <section className={styles.statePanel}>
          <Users size={22} color="#6de7df" />
          <h2>{ui.emptyTitle}</h2>
          <p>{ui.emptyBody}</p>
          <button className={styles.primaryBtn} type="button" onClick={() => setCreateOpen(true)}>
            <Plus size={15} />
            {ui.emptyAction}
          </button>
        </section>
      ) : !cards.length ? (
        <section className={styles.statePanel}>
          <ImageOff size={22} color="#8f999b" />
          <h2>{ui.emptyTitle}</h2>
          <p>{query}</p>
        </section>
      ) : (
        <section className={styles.gridWrap}>
          <ul className={styles.grid}>
            {cards.map((card) => (
              <ActorCard key={card.id} card={card} badges={{ team: ui.teamBadge, private: ui.privateBadge }} />
            ))}
          </ul>
        </section>
      )}

      {loading && !authRequired ? (
        <span style={{ position: "fixed", right: 20, bottom: 20, color: "#8f999b" }} aria-hidden="true">
          <LoaderCircle className={styles.spin} size={16} />
        </span>
      ) : null}

      <CreateActorModal open={createOpen} token={session?.access_token || ""} copy={ui} onClose={() => setCreateOpen(false)} onCreated={handleCreated} />
    </main>
  );
}
