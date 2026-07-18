"use client";

import { useState } from "react";
import type { ActorProfile } from "@/lib/actors";
import type { ActorLibraryCopy } from "./actor-copy";
import { normalizeTagList } from "./actor-view-model";
import styles from "./actors.module.css";

// 详情页左侧人物设定面板：年龄感/性别表达/族裔气质/脸型/发型/体型/气质/风格标签/prompt。
export function ActorProfilePanel({ actor, copy }: { actor: ActorProfile; copy: ActorLibraryCopy }) {
  const tags = [...normalizeTagList(actor.temperament), ...normalizeTagList(actor.playable_roles)];
  const specs: Array<[string, string]> = [
    [copy.fieldAge, actor.age_range],
    [copy.fieldGender, actor.gender_expression],
    [copy.fieldEthnicity, actor.ethnicity_style],
    [copy.fieldFace, actor.face_description],
    [copy.fieldHair, actor.hair_description],
    [copy.fieldBody, actor.body_description],
  ];

  return (
    <aside className={styles.profilePanel}>
      <div className={styles.profileAvatar}>
        {actor.avatar_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={actor.avatar_url} alt={actor.name} />
        ) : (
          <span className={styles.cardInitials}>{actor.name.slice(0, 1).toUpperCase() || "A"}</span>
        )}
      </div>

      <div className={styles.profileSection}>
        <p className={styles.profileSectionTitle}>{copy.profileKicker}</p>
        <h1 className={styles.profileName}>{actor.name}</h1>
        {tags.length ? (
          <span className={styles.tagRow}>
            {tags.map((tag) => (
              <span className={styles.tag} key={tag}>
                {tag}
              </span>
            ))}
          </span>
        ) : null}
      </div>

      <dl className={styles.specList}>
        {specs.map(([label, value]) => (
          <SpecRow key={label} label={label} value={value} fallback={copy.notProvided} />
        ))}
      </dl>

      {actor.bio ? (
        <div className={styles.profileSection}>
          <p className={styles.profileSectionTitle}>{copy.fieldBio}</p>
          <dl className={styles.specList}>
            <dd style={{ gridColumn: "1 / -1", color: "#b7c0c1", fontSize: 12, lineHeight: 1.7 }}>{actor.bio}</dd>
          </dl>
        </div>
      ) : null}

      {actor.base_prompt ? <PromptBlock title={copy.promptBase} text={actor.base_prompt} copyLabel={copy.copy} copiedLabel={copy.copied} /> : null}
      {actor.negative_prompt ? <PromptBlock title={copy.promptNegative} text={actor.negative_prompt} copyLabel={copy.copy} copiedLabel={copy.copied} /> : null}
    </aside>
  );
}

function SpecRow({ label, value, fallback }: { label: string; value: string; fallback: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value?.trim() ? value : <span style={{ color: "#5c6668" }}>{fallback}</span>}</dd>
    </>
  );
}

function PromptBlock({ title, text, copyLabel, copiedLabel }: { title: string; text: string; copyLabel: string; copiedLabel: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={styles.promptBlock}>
      <div className={styles.promptHead}>
        <span>{title}</span>
        <button
          className={styles.copyBtn}
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              window.setTimeout(() => setCopied(false), 1600);
            });
          }}
        >
          {copied ? copiedLabel : copyLabel}
        </button>
      </div>
      <pre>{text}</pre>
    </div>
  );
}
