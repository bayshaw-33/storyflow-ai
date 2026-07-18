"use client";

import { Clapperboard, ImageOff } from "lucide-react";
import type { ActorLibraryCopy } from "./actor-copy";
import type { PortrayalLike } from "./actor-view-model";
import styles from "./actors.module.css";

type Props = {
  copy: ActorLibraryCopy;
  portrayals: PortrayalLike[];
  loading: boolean;
  error: string;
};

// 「参演作品」区：展示该演员在各作品中的形象卡片。
export function PortrayalGallery({ copy, portrayals, loading, error }: Props) {
  return (
    <section className={styles.assetSection} aria-label={copy.portrayalsKicker}>
      <div className={styles.assetSectionHead}>
        <h2>{copy.portrayalsKicker}</h2>
        {portrayals.length ? <span className={styles.assetCount}>{portrayals.length}</span> : null}
      </div>

      {error ? <div className={styles.packErrorBox} role="alert">{copy.portrayalsError} {error}</div> : null}

      {loading ? (
        <div className={styles.portrayalGrid}>
          {[0, 1, 2].map((index) => (
            <div className={styles.skeletonCard} key={index} style={{ aspectRatio: "16 / 10" }} />
          ))}
        </div>
      ) : portrayals.length ? (
        <div className={styles.portrayalGrid}>
          {portrayals.map((portrayal) => (
            <article className={styles.portrayalCard} key={portrayal.id}>
              <div className={styles.portrayalMedia}>
                {portrayal.reference_image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={portrayal.reference_image_url} alt={portrayal.portrayal_name || copy.portrayalUntitled} loading="lazy" />
                ) : (
                  <Clapperboard size={22} />
                )}
              </div>
              <div className={styles.portrayalBody}>
                <strong>{portrayal.portrayal_name || copy.portrayalUntitled}</strong>
                {portrayal.costume_direction ? <small>{portrayal.costume_direction}</small> : null}
                <small>
                  {copy.portrayalProject} · {portrayal.project_id || "—"}
                  {portrayal.is_reusable ? ` · ${copy.portrayalReusable}` : ""}
                </small>
              </div>
            </article>
          ))}
        </div>
      ) : !error ? (
        <div className={styles.packEmptyBox}>
          <ImageOff size={20} />
          <span>{copy.portrayalsEmpty}</span>
        </div>
      ) : null}
    </section>
  );
}
