"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import type { ActorProfile } from "@/lib/actors";
import type { ActorLibraryCopy } from "./actor-copy";
import { normalizeTagList } from "./actor-view-model";
import styles from "./actors.module.css";

type Props = {
  actor: ActorProfile;
  copy: ActorLibraryCopy;
};

// 详情页左侧人物设定面板：
// 年龄感 / 性别表达 / 族裔文化气质 / 脸型与五官 / 发型 / 肤色 / 体型 / 气质与风格标签 / 简介
// base_prompt 与 negative_prompt 默认折叠在「技术提示词」中，不占据首屏。
export function ActorProfilePanel({ actor, copy }: Props) {
  const temperamentTags = normalizeTagList(actor.temperament);
  const roleTags = normalizeTagList(actor.playable_roles);
  const specs: Array<[string, string]> = [
    [copy.fieldAge, actor.age_range],
    [copy.fieldGender, actor.gender_expression],
    [copy.fieldEthnicity, actor.ethnicity_style],
    [copy.fieldFace, actor.face_description],
    [copy.fieldHair, actor.hair_description],
    [copy.fieldBody, actor.body_description],
  ];

  const hasTechnicalPrompt = Boolean(actor.base_prompt?.trim() || actor.negative_prompt?.trim());

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
        {temperamentTags.length || roleTags.length ? (
          <div className={styles.profileTagBlock}>
            {temperamentTags.length ? (
              <span className={styles.tagRow}>
                {temperamentTags.map((tag) => (
                  <span className={styles.tag} key={`t-${tag}`}>
                    {tag}
                  </span>
                ))}
              </span>
            ) : null}
            {roleTags.length ? (
              <span className={styles.tagRow}>
                {roleTags.map((tag) => (
                  <span className={`${styles.tag} ${styles.tagMuted}`} key={`r-${tag}`}>
                    {tag}
                  </span>
                ))}
              </span>
            ) : null}
          </div>
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
          <p className={styles.profileBio}>{actor.bio}</p>
        </div>
      ) : null}

      {hasTechnicalPrompt ? (
        <TechnicalPrompts
          icon={ChevronRight}
          expandIcon={ChevronDown}
          title={copy.promptTechnical}
          hint={copy.promptTechnicalHint}
          expandLabel={copy.promptExpand}
          collapseLabel={copy.promptCollapse}
          baseLabel={copy.promptBase}
          negativeLabel={copy.promptNegative}
          copyLabel={copy.copy}
          copiedLabel={copy.copied}
          basePrompt={actor.base_prompt}
          negativePrompt={actor.negative_prompt}
        />
      ) : null}
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

type TechnicalProps = {
  icon: LucideIcon;
  expandIcon: LucideIcon;
  title: string;
  hint: string;
  expandLabel: string;
  collapseLabel: string;
  baseLabel: string;
  negativeLabel: string;
  copyLabel: string;
  copiedLabel: string;
  basePrompt: string;
  negativePrompt: string;
};

function TechnicalPrompts(props: TechnicalProps) {
  const { icon: CollapseIcon, expandIcon: ExpandIcon } = props;
  const [open, setOpen] = useState(false);
  return (
    <section className={styles.technicalBlock} aria-label={props.title}>
      <button
        type="button"
        className={styles.technicalToggle}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className={styles.technicalToggleMain}>
          {open ? <ExpandIcon size={14} /> : <CollapseIcon size={14} />}
          <strong>{props.title}</strong>
        </span>
        <span className={styles.technicalToggleHint}>
          {open ? props.collapseLabel : props.expandLabel}
        </span>
      </button>
      {open ? (
        <div className={styles.technicalBody}>
          <p className={styles.technicalHint}>{props.hint}</p>
          {props.basePrompt?.trim() ? (
            <PromptBlock title={props.baseLabel} text={props.basePrompt} copyLabel={props.copyLabel} copiedLabel={props.copiedLabel} />
          ) : null}
          {props.negativePrompt?.trim() ? (
            <PromptBlock title={props.negativeLabel} text={props.negativePrompt} copyLabel={props.copyLabel} copiedLabel={props.copiedLabel} />
          ) : null}
        </div>
      ) : null}
    </section>
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
