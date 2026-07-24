"use client";

import { useState, type KeyboardEvent } from "react";
import { X } from "lucide-react";
import { useI18n } from "@/lib/i18n/useI18n";
import styles from "./settings.module.css";

type TagInputProps = {
  tags: string[];
  onChange: (tags: string[]) => void;
  /** 最大标签数，默认 5。 */
  maxTags?: number;
};

const MIN_TAG_LEN = 2;
const MAX_TAG_LEN = 8;

/**
 * 创作领域标签输入：chip 输入，回车添加，点击 x 删除。
 * 校验：每个标签 2-8 字符，最多 maxTags 个，去重。
 */
export function TagInput({ tags, onChange, maxTags = 5 }: TagInputProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>("");

  function addTag(raw: string) {
    const value = raw.trim();
    if (!value) return;
    if (value.length < MIN_TAG_LEN || value.length > MAX_TAG_LEN) {
      setError(isZh ? `每个标签 ${MIN_TAG_LEN}-${MAX_TAG_LEN} 个字符` : `Each tag must be ${MIN_TAG_LEN}-${MAX_TAG_LEN} characters`);
      return;
    }
    if (tags.includes(value)) {
      setError(isZh ? "标签已存在" : "Tag already exists");
      return;
    }
    if (tags.length >= maxTags) {
      setError(isZh ? `最多 ${maxTags} 个标签` : `Up to ${maxTags} tags`);
      return;
    }
    setError("");
    setDraft("");
    onChange([...tags, value]);
  }

  function removeTag(tag: string) {
    onChange(tags.filter((t) => t !== tag));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addTag(draft);
    } else if (event.key === "Backspace" && !draft && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div className={styles.tagInput}>
      <div className={styles.tagChips}>
        {tags.map((tag) => (
          <span key={tag} className={styles.tagChip}>
            {tag}
            <button
              type="button"
              className={styles.tagChipRemove}
              onClick={() => removeTag(tag)}
              aria-label={isZh ? `移除 ${tag}` : `Remove ${tag}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <input
        type="text"
        className={styles.input}
        value={draft}
        placeholder={isZh ? `输入标签后回车（${MIN_TAG_LEN}-${MAX_TAG_LEN} 字符）` : `Type and press Enter (${MIN_TAG_LEN}-${MAX_TAG_LEN} chars)`}
        disabled={tags.length >= maxTags}
        onChange={(event) => {
          setDraft(event.target.value);
          if (error) setError("");
        }}
        onKeyDown={handleKeyDown}
        onBlur={() => draft && addTag(draft)}
      />
      {error ? <span className={styles.errorText}>{error}</span> : null}
      <span className={styles.hint}>
        {isZh ? `已 ${tags.length}/${maxTags} · 用于主页展示创作领域` : `${tags.length}/${maxTags} · Shown on your profile as creative focus`}
      </span>
    </div>
  );
}
