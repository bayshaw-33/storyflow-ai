"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  getUniverseCopy,
  formatUpdatedAt,
  type WorkCard,
  type WorkDetailResponse,
} from "./universe-view-model";
import styles from "./universe.module.css";

type UniverseWorksProps = {
  universeId: string;
  accessToken: string | null;
  isZh: boolean;
  /** 从 bundle.links 拿到的最小回退数据（API 失败时用） */
  fallbackLinks: Array<{ projectId: string; projectRole: string; updatedAt: string; title: string }>;
};

/**
 * PRD §6.3 作品区。合并原 Works + Linked Projects。
 * 作品卡展示封面/标题/project_role/类型/状态/集数或 Shot 数/角色场景道具计数/更新时间。
 * 点击打开侧边抽屉：主要角色(6)/核心场景(6)/关键道具(6)/进入创作工作台/进入制作工作台。
 * 按 owner_id+project_id 查询，不得客户端跨表全量拉取。
 */
export function UniverseWorks({ universeId, accessToken, isZh, fallbackLinks }: UniverseWorksProps) {
  const copy = getUniverseCopy(isZh);
  const [works, setWorks] = useState<WorkCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<WorkDetailResponse | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerError, setDrawerError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadWorks() {
      setLoading(true);
      setLoadError("");
      if (!accessToken) {
        // 未登录：用 fallback 数据
        setWorks(fallbackLinks.map((link) => ({
          id: link.projectId,
          title: link.title,
          projectRole: link.projectRole,
          status: "draft",
          shotCount: 0,
          characterCount: 0,
          sceneCount: 0,
          propCount: 0,
          coverUrl: null,
          updatedAt: link.updatedAt,
        })));
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/universe/${encodeURIComponent(universeId)}/works`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.works) throw new Error(payload?.error || `HTTP ${res.status}`);
        if (!cancelled) setWorks(payload.works as WorkCard[]);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load works");
          setWorks(fallbackLinks.map((link) => ({
            id: link.projectId,
            title: link.title,
            projectRole: link.projectRole,
            status: "draft",
            shotCount: 0,
            characterCount: 0,
            sceneCount: 0,
            propCount: 0,
            coverUrl: null,
            updatedAt: link.updatedAt,
          })));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadWorks();
    return () => { cancelled = true; };
  }, [universeId, accessToken, fallbackLinks]);

  const openDrawer = useCallback(async (projectId: string) => {
    setSelectedProjectId(projectId);
    setDrawer(null);
    setDrawerError("");
    setDrawerLoading(true);
    try {
      const res = await fetch(`/api/universe/${encodeURIComponent(universeId)}/works/${encodeURIComponent(projectId)}`, {
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.project) throw new Error(payload?.error || `HTTP ${res.status}`);
      setDrawer(payload as WorkDetailResponse);
    } catch (err) {
      setDrawerError(err instanceof Error ? err.message : "Failed to load work detail");
    } finally {
      setDrawerLoading(false);
    }
  }, [universeId, accessToken]);

  const closeDrawer = useCallback(() => {
    setSelectedProjectId(null);
    setDrawer(null);
    setDrawerError("");
  }, []);

  const displayWorks = useMemo(() => works.length ? works : fallbackLinks.map((link) => ({
    id: link.projectId,
    title: link.title,
    projectRole: link.projectRole,
    status: "draft",
    shotCount: 0,
    characterCount: 0,
    sceneCount: 0,
    propCount: 0,
    coverUrl: null,
    updatedAt: link.updatedAt,
  })), [works, fallbackLinks]);

  if (loading && !displayWorks.length) {
    return <div className={styles.loadingState}><Loader2 size={16} className="spin" /> {copy.works.loading}</div>;
  }

  if (!displayWorks.length) {
    return (
      <div className={styles.emptyState}>
        <strong>{copy.works.empty}</strong>
      </div>
    );
  }

  return (
    <div>
      {loadError ? (
        <div className={`${styles.notice} ${styles.noticeError}`} style={{ margin: "0 0 14px" }}>
          {loadError}
        </div>
      ) : null}
      <div className={styles.workGrid}>
        {displayWorks.map((work) => {
          const initial = (work.title.trim()[0] || "·").toUpperCase();
          return (
            <article
              key={work.id}
              className={styles.workCard}
              onClick={() => openDrawer(work.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  openDrawer(work.id);
                }
              }}
            >
              <div className={styles.workCover}>
                {work.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={work.coverUrl} alt={work.title} loading="lazy" />
                ) : (
                  <div className={styles.workCoverPlaceholder}>{initial}</div>
                )}
              </div>
              <div className={styles.workBody}>
                <h3 className={styles.workTitle}>{work.title}</h3>
                <div className={styles.workRoleRow}>
                  <span className={styles.tag}>{work.projectRole}</span>
                  <span style={{ color: "#8f999b" }}>{work.status}</span>
                </div>
                <div className={styles.workMetrics}>
                  <span><strong>{work.shotCount}</strong> {copy.works.shots}</span>
                  <span><strong>{work.characterCount}</strong> {copy.works.characters}</span>
                  <span><strong>{work.sceneCount}</strong> {copy.works.scenes}</span>
                  <span><strong>{work.propCount}</strong> {copy.works.props}</span>
                  <span className={styles.spacer} />
                  <span>{formatUpdatedAt(work.updatedAt, isZh)}</span>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {selectedProjectId ? (
        <div className={styles.workDrawer} role="dialog" aria-modal="true">
          <div className={styles.workDrawerBackdrop} onClick={closeDrawer} />
          <div className={styles.workDrawerPanel}>
            <div className={styles.drawerHeader}>
              <div>
                <p className={styles.panelKicker}>{copy.works.drawerOpen}</p>
                <h2 className={styles.panelTitle}>
                  {drawer?.project.title || (works.find((w) => w.id === selectedProjectId)?.title ?? selectedProjectId)}
                </h2>
              </div>
              <button type="button" className={styles.iconButton} aria-label={copy.works.drawerClose} onClick={closeDrawer}>
                <X size={16} />
              </button>
            </div>

            {drawerLoading ? (
              <div className={styles.loadingState}><Loader2 size={16} className="spin" /> {copy.works.loading}</div>
            ) : null}

            {drawerError ? (
              <div className={`${styles.notice} ${styles.noticeError}`}>{drawerError}</div>
            ) : null}

            {drawer ? (
              <>
                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>{copy.works.mainCharacters}</h3>
                  {drawer.characters.length ? (
                    <div className={styles.drawerRefGrid}>
                      {drawer.characters.map((ref, idx) => (
                        <RefCard key={`${ref.name}-${idx}`} name={ref.name} thumbnail={ref.thumbnail} />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.panelBody}>{copy.works.notLinked}</p>
                  )}
                </div>

                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>{copy.works.coreScenes}</h3>
                  {drawer.scenes.length ? (
                    <div className={styles.drawerRefGrid}>
                      {drawer.scenes.map((ref, idx) => (
                        <RefCard key={`${ref.name}-${idx}`} name={ref.name} thumbnail={ref.thumbnail} />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.panelBody}>{copy.works.notLinked}</p>
                  )}
                </div>

                <div className={styles.drawerSection}>
                  <h3 className={styles.drawerSectionTitle}>{copy.works.keyProps}</h3>
                  {drawer.props.length ? (
                    <div className={styles.drawerRefGrid}>
                      {drawer.props.map((ref, idx) => (
                        <RefCard key={`${ref.name}-${idx}`} name={ref.name} thumbnail={ref.thumbnail} />
                      ))}
                    </div>
                  ) : (
                    <p className={styles.panelBody}>{copy.works.notLinked}</p>
                  )}
                </div>

                <div className={styles.drawerActions}>
                  <Link className={styles.primaryButton} href={`/script-workbench?projectId=${encodeURIComponent(drawer.project.id)}`}>
                    {copy.works.enterCreation}
                  </Link>
                  <Link className={styles.secondaryButton} href={`/production?projectId=${encodeURIComponent(drawer.project.id)}`}>
                    {copy.works.enterProduction}
                  </Link>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function RefCard({ name, thumbnail }: { name: string; thumbnail: string | null }) {
  const initial = (name.trim()[0] || "·").toUpperCase();
  return (
    <div className={styles.drawerRefCard}>
      <div className={styles.drawerRefThumb}>
        {thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumbnail} alt={name} loading="lazy" />
        ) : (
          <span>{initial}</span>
        )}
      </div>
      <span className={styles.drawerRefName}>{name}</span>
    </div>
  );
}
