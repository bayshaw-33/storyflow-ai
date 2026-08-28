"use client";

import {
  Bookmark,
  Compass,
  FileImage,
  Heart,
  Layers3,
  Mic2,
  Users,
} from "lucide-react";
import type { Locale } from "@/lib/i18n/dictionaries";
import {
  COMMUNITY_SECTIONS,
  getCommunitySectionLabel,
  type CommunitySectionId,
} from "@/lib/client/v2/community/view-model";
import styles from "@/app/community/community.module.css";

const ICONS = {
  recommended: Compass,
  following: Heart,
  universes: Layers3,
  works: FileImage,
  actors: Users,
  assets: Mic2,
  saved: Bookmark,
} as const;

export function CommunityNavigation(props: {
  activeSection: CommunitySectionId;
  locale: Locale;
  onChange: (section: CommunitySectionId) => void;
}) {
  return (
    <nav className={styles.sectionNav} aria-label={props.locale === "zh-CN" ? "社区内容分区" : "Community sections"}>
      <p className={styles.navEyebrow}>{props.locale === "zh-CN" ? "探索空间" : "Explore"}</p>
      <div className={styles.navList}>
        {COMMUNITY_SECTIONS.map((section) => {
          const Icon = ICONS[section.id];
          const active = props.activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
              aria-current={active ? "page" : undefined}
              aria-pressed={active}
              onClick={() => props.onChange(section.id)}
            >
              <Icon size={15} strokeWidth={1.8} />
              <span>{getCommunitySectionLabel(section.id, props.locale)}</span>
              {active ? <span className={styles.navDot} aria-hidden="true" /> : null}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
