import Link from "next/link";
import { ArrowUpRight, Layers3, Plus } from "lucide-react";
import type { UniverseCommunityWork } from "@/lib/contracts/v2/community-universe";
import styles from "@/app/community/community.module.css";

export function UniverseWorksSection(props: {
  works: readonly UniverseCommunityWork[];
  isOwner: boolean;
  onCreate: () => void;
}) {
  return (
    <section className={styles.universePanel} aria-labelledby="universe-works-title">
      <div className={styles.universePanelHeader}>
        <div>
          <span className={styles.universePanelKicker}>CONNECTED WORKS</span>
          <h2 id="universe-works-title" className={styles.universePanelTitle}>从这个 Universe 生长出的作品</h2>
        </div>
        {props.isOwner ? (
          <button type="button" className={styles.universeActionPrimary} onClick={props.onCreate}>
            <Plus size={15} aria-hidden="true" />
            创建 Project + Work
          </button>
        ) : null}
      </div>

      {props.works.length ? (
        <div className={styles.universeGrid}>
          {props.works.map((work) => (
            <article className={styles.universeWorkCard} key={work.id}>
              <div className={styles.universeWorkIcon} aria-hidden="true"><Layers3 size={20} /></div>
              <div className={styles.universeWorkBody}>
                <div className={styles.universeWorkMeta}>
                  <span>{labelWorkType(work.workType)}</span>
                  <span className={`${styles.statusPill} ${work.visibility === "public" ? styles.statusCanon : styles.statusDraft}`}>
                    {work.visibility === "public" ? "公开" : "所有者可见"}
                  </span>
                </div>
                <h3 className={styles.universeWorkTitle}>{work.title}</h3>
                <p>{work.projectRole} · {work.status}</p>
                <Link className={styles.universeInlineLink} href={work.publicationId ? `/community/${encodeURIComponent(work.publicationId)}` : `/projects/${encodeURIComponent(work.projectId)}`}>
                  查看作品 <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.universeEmpty}>
          <strong>还没有连接作品</strong>
          <span>{props.isOwner ? "把第一个 Work 放回这个世界，Universe 才会真正开始生长。" : "这个 Universe 暂时没有公开关联作品。"}</span>
          {props.isOwner ? <button type="button" className={styles.universeAction} onClick={props.onCreate}>创建第一个 Work</button> : null}
        </div>
      )}
    </section>
  );
}

function labelWorkType(value: string): string {
  const labels: Record<string, string> = {
    script: "剧本",
    song: "歌曲",
    art: "美术",
    storyboard: "分镜",
    video: "视频",
    voice: "配音",
    editing: "剪辑",
  };
  return labels[value] || "创作 Work";
}
