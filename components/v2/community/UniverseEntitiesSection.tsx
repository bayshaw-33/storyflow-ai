import { Mic2, Palette, UserRound } from "lucide-react";
import type {
  UniverseCommunityActor,
  UniverseCommunityAsset,
  UniverseCommunityEntity,
  UniverseCommunityLocalOverlay,
  UniverseCommunityCandidate,
  UniverseCommunityVoice,
} from "@/lib/contracts/v2/community-universe";
import styles from "@/app/community/community.module.css";

export function UniverseEntitiesSection(props: {
  entities: readonly UniverseCommunityEntity[];
  actors: readonly UniverseCommunityActor[];
  voices: readonly UniverseCommunityVoice[];
  assets: readonly UniverseCommunityAsset[];
  localOverlays: readonly UniverseCommunityLocalOverlay[];
  candidates: readonly UniverseCommunityCandidate[];
  isOwner: boolean;
}) {
  const canon = props.entities.filter((entity) => entity.status === "canon");
  const alternative = props.entities.filter((entity) => entity.status === "alternative");

  return (
    <section className={styles.universePanel} aria-labelledby="universe-entities-title">
      <div className={styles.universePanelHeader}>
        <div>
          <span className={styles.universePanelKicker}>WORLD OBJECTS</span>
          <h2 id="universe-entities-title" className={styles.universePanelTitle}>这个 Universe 里的对象</h2>
        </div>
        <span className={styles.universeCounter}>{props.entities.length} 个实体 · {props.assets.length} 项资产</span>
      </div>

      <div className={styles.universeObjectGroups}>
        <ObjectGroup title="Canon" description="公开世界的稳定事实" entities={canon} />
        {alternative.length ? <ObjectGroup title="Alternative" description="仍可继续讨论的分支版本" entities={alternative} /> : null}
        {props.isOwner ? (
          <>
            <section className={styles.universeObjectGroup}>
              <div className={styles.universeGroupHeading}>
                <div><span className={styles.universeGroupLabel}>Local Overlay</span><p>只影响你当前 Work 的本地覆盖层</p></div>
                <span>{props.localOverlays.length}</span>
              </div>
              {props.localOverlays.length ? (
                <div className={styles.universeMiniList}>
                  {props.localOverlays.map((overlay) => <div key={overlay.id} className={styles.universeMiniItem}><strong>{overlay.entityType}</strong><span>{overlay.entityId.slice(0, 12)} · rev {overlay.revision}</span></div>)}
                </div>
              ) : <p className={styles.universeGroupEmpty}>还没有本地覆盖层。</p>}
            </section>
            <section className={styles.universeObjectGroup}>
              <div className={styles.universeGroupHeading}>
                <div><span className={styles.universeGroupLabel}>草稿候选</span><p>等待你确认是否进入 Canon</p></div>
                <span>{props.candidates.length}</span>
              </div>
              {props.candidates.length ? (
                <div className={styles.universeMiniList}>
                  {props.candidates.map((candidate) => <div key={candidate.id} className={styles.universeMiniItem}><strong>{candidate.title}</strong><span>{candidate.type} · {Math.round(candidate.confidence * 100)}% confidence</span></div>)}
                </div>
              ) : <p className={styles.universeGroupEmpty}>暂无待确认候选。</p>}
            </section>
          </>
        ) : null}
      </div>

      <div className={styles.universeLinkedGrid}>
        <LinkedGroup title="演员" icon={<UserRound size={16} />} items={props.actors.map((actor) => `${actor.name} · ${actor.status}`)} />
        <LinkedGroup title="声音" icon={<Mic2 size={16} />} items={props.voices.map((voice) => `${voice.label} · ${voice.provider}`)} />
        <LinkedGroup title="视觉资产" icon={<Palette size={16} />} items={props.assets.map((asset) => `${asset.name} · ${asset.kind}`)} />
      </div>
    </section>
  );
}

function ObjectGroup(props: { title: string; description: string; entities: readonly UniverseCommunityEntity[] }) {
  return (
    <section className={styles.universeObjectGroup}>
      <div className={styles.universeGroupHeading}>
        <div><span className={styles.universeGroupLabel}>{props.title}</span><p>{props.description}</p></div>
        <span>{props.entities.length}</span>
      </div>
      {props.entities.length ? (
        <div className={styles.universeObjectGrid}>
          {props.entities.map((entity) => (
            <article className={styles.universeObjectCard} key={entity.id}>
              <div className={styles.universeObjectTopline}><strong>{entity.name}</strong><span className={`${styles.statusPill} ${statusClass(entity.status)}`}>{entity.status}</span></div>
              <span className={styles.universeObjectKind}>{entity.kind}</span>
              {entity.summary ? <p className={styles.universeObjectSummary}>{entity.summary}</p> : null}
            </article>
          ))}
        </div>
      ) : <p className={styles.universeGroupEmpty}>这个分组还没有公开对象。</p>}
    </section>
  );
}

function LinkedGroup(props: { title: string; icon: React.ReactNode; items: readonly string[] }) {
  return (
    <section className={styles.universeLinkedGroup}>
      <div className={styles.universeLinkedHeading}>{props.icon}<strong>{props.title}</strong><span>{props.items.length}</span></div>
      {props.items.length ? <ul>{props.items.slice(0, 8).map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}</ul> : <p>暂无公开内容</p>}
    </section>
  );
}

function statusClass(status: string): string {
  if (status === "canon") return styles.statusCanon;
  if (status === "alternative") return styles.statusAlternative;
  return styles.statusDraft;
}
