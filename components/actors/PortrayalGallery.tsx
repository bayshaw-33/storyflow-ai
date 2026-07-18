"use client";

import { Clapperboard, ImageOff } from "lucide-react";
import type { ActorLibraryCopy } from "./actor-copy";
import { toPortrayalCard, type PortrayalLike } from "./actor-view-model";
import styles from "./actors.module.css";

type Props = {
  copy: ActorLibraryCopy;
  portrayals: PortrayalLike[];
  loading: boolean;
  error: string;
};

// 「参演作品」区：每个 Portrayal 卡展示
// 作品封面或角色剧照 / 作品标题 / Universe 名称 / Character 名称 / 造型服装方向 / 形象版本 / 可复用状态。
// PRD §7.3：禁止向用户展示裸 project_id / owner_id / team_id。
export function PortrayalGallery({ copy, portrayals, loading, error }: Props) {
  const cards = portrayals.map((p) =>
    toPortrayalCard(p, { untitledWork: copy.portrayalUntitledWork, untitledCharacter: copy.portrayalUntitled }),
  );

  return (
    <section className={styles.assetSection} aria-label={copy.portrayalsKicker}>
      <div className={styles.assetSectionHead}>
        <h2>{copy.portrayalsKicker}</h2>
        {cards.length ? <span className={styles.assetCount}>{cards.length}</span> : null}
      </div>

      {error ? (
        <div className={styles.packErrorBox} role="alert">
          {copy.portrayalsError} {error}
        </div>
      ) : null}

      {loading ? (
        <div className={styles.portrayalGrid}>
          {[0, 1, 2].map((index) => (
            <div className={styles.skeletonCard} key={index} style={{ aspectRatio: "16 / 10" }} />
          ))}
        </div>
      ) : cards.length ? (
        <div className={styles.portrayalGrid}>
          {cards.map((card) => (
            <article className={styles.portrayalCard} key={card.id}>
              <div className={styles.portrayalMedia}>
                {card.referenceImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={card.referenceImageUrl} alt={card.characterName || copy.portrayalUntitled} loading="lazy" />
                ) : (
                  <Clapperboard size={22} />
                )}
                <span className={card.isReusable ? styles.portrayalReusableBadge : styles.portrayalSoloBadge}>
                  {card.isReusable ? copy.portrayalReusableBadge : copy.portrayalNotReusableBadge}
                </span>
              </div>
              <div className={styles.portrayalBody}>
                <strong className={styles.portrayalTitle}>{card.workTitle}</strong>
                <span className={styles.portrayalCharacter}>{card.characterName}</span>
                <dl className={styles.portrayalSpec}>
                  <div>
                    <dt>{copy.portrayalUniverse}</dt>
                    <dd>{card.universeName || copy.notProvided}</dd>
                  </div>
                  <div>
                    <dt>{copy.portrayalCostume}</dt>
                    <dd>{card.costumeDirection || copy.notProvided}</dd>
                  </div>
                  <div>
                    <dt>{copy.portrayalVisual}</dt>
                    <dd>{card.visualPrompt || copy.notProvided}</dd>
                  </div>
                </dl>
                <small className={styles.portrayalUpdatedAt}>{copy.portrayalUpdatedAt(card.updatedAt)}</small>
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
