"use client";

import { Search, X } from "lucide-react";
import type { Locale } from "@/lib/i18n/dictionaries";
import type { CommunitySectionId } from "@/lib/client/v2/community/view-model";
import { getCommunitySectionLabel } from "@/lib/client/v2/community/view-model";
import styles from "@/app/community/community.module.css";

export function CommunityFilters(props: {
  locale: Locale;
  section: CommunitySectionId;
  query: string;
  onQueryChange: (value: string) => void;
  onQuerySubmit?: () => void;
}) {
  const isZh = props.locale === "zh-CN";
  return (
    <form className={styles.toolbar} onSubmit={(event) => { event.preventDefault(); props.onQuerySubmit?.(); }}>
      <div className={styles.toolbarContext}>
        <span className={styles.toolbarKicker}>{isZh ? "当前视图" : "Current view"}</span>
        <strong>{getCommunitySectionLabel(props.section, props.locale)}</strong>
      </div>
      <label className={styles.searchBox}>
        <Search size={15} aria-hidden="true" />
        <span className={styles.srOnly}>{isZh ? "搜索社区内容" : "Search community"}</span>
        <input
          type="search"
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          placeholder={isZh ? "搜索作品、Universe、演员…" : "Search works, universes, actors…"}
        />
        {props.query ? (
          <button
            type="button"
            className={styles.clearSearch}
            onClick={() => { props.onQueryChange(""); props.onQuerySubmit?.(); }}
            aria-label={isZh ? "清除搜索" : "Clear search"}
          >
            <X size={14} />
          </button>
        ) : null}
      </label>
    </form>
  );
}
