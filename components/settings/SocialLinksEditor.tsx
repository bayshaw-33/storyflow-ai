"use client";

import { useI18n } from "@/lib/i18n/useI18n";
import type { SocialLinks, SocialRegion } from "@/components/profile/types";
import styles from "./settings.module.css";

type SocialLinksEditorProps = {
  value: SocialLinks;
  onChange: (value: SocialLinks) => void;
};

const URL_REGEX = /^https:\/\/.+/;

/**
 * 社交链接编辑器（双地区并存）。
 * 顶部 radio 决定主页展示地区（display_region）；两地区可同时填写，互不清空。
 * 每个 URL 必须 https:// 开头，允许空值。
 */
export function SocialLinksEditor({ value, onChange }: SocialLinksEditorProps) {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  const overseas = value.overseas ?? {};
  const china = value.china ?? {};
  const displayRegion: SocialRegion = value.display_region ?? "overseas";

  function patchOverseas(field: keyof NonNullable<SocialLinks["overseas"]>, v: string) {
    onChange({ ...value, overseas: { ...overseas, [field]: v || undefined } });
  }
  function patchChina(field: keyof NonNullable<SocialLinks["china"]>, v: string) {
    onChange({ ...value, china: { ...china, [field]: v || undefined } });
  }
  function setRegion(region: SocialRegion) {
    onChange({ ...value, display_region: region });
  }

  const overseasFields: Array<{ key: keyof NonNullable<SocialLinks["overseas"]>; label: string; placeholder: string }> = [
    { key: "twitter", label: "Twitter / X", placeholder: "https://x.com/yourname" },
    { key: "facebook", label: "Facebook", placeholder: "https://facebook.com/yourname" },
    { key: "instagram", label: "Instagram", placeholder: "https://instagram.com/yourname" },
  ];
  const chinaFields: Array<{ key: keyof NonNullable<SocialLinks["china"]>; label: string; placeholder: string }> = [
    { key: "douyin", label: isZh ? "抖音" : "Douyin", placeholder: "https://douyin.com/user/xxx" },
    { key: "xiaohongshu", label: isZh ? "小红书" : "Xiaohongshu", placeholder: "https://xiaohongshu.com/user/xxx" },
    { key: "douban", label: isZh ? "豆瓣" : "Douban", placeholder: "https://douban.com/people/xxx" },
  ];

  return (
    <div className={styles.tagInput}>
      <span className={styles.label}>
        {isZh ? "主页展示地区" : "Profile display region"}
        <span className={styles.labelHint}>
          {isZh ? "两地区可同时填写，此处选择主页默认展示" : "Both regions can be filled; pick which to show on your page"}
        </span>
      </span>
      <div className={styles.regionToggle} role="radiogroup" aria-label={isZh ? "展示地区" : "Display region"}>
        <button
          type="button"
          role="radio"
          aria-checked={displayRegion === "overseas"}
          className={displayRegion === "overseas" ? styles.regionActive : ""}
          onClick={() => setRegion("overseas")}
        >
          {isZh ? "海外" : "Overseas"}
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={displayRegion === "china"}
          className={displayRegion === "china" ? styles.regionActive : ""}
          onClick={() => setRegion("china")}
        >
          {isZh ? "中国" : "China"}
        </button>
      </div>

      <div className={styles.regionGroup}>
        <h4 className={styles.regionGroupTitle}>{isZh ? "海外地区" : "Overseas"}</h4>
        {overseasFields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            value={overseas[field.key] ?? ""}
            placeholder={field.placeholder}
            isZh={isZh}
            onChange={(v) => patchOverseas(field.key, v)}
          />
        ))}
      </div>

      <div className={styles.regionGroup}>
        <h4 className={styles.regionGroupTitle}>{isZh ? "中国地区" : "China"}</h4>
        {chinaFields.map((field) => (
          <Field
            key={field.key}
            label={field.label}
            value={china[field.key] ?? ""}
            placeholder={field.placeholder}
            isZh={isZh}
            onChange={(v) => patchChina(field.key, v)}
          />
        ))}
      </div>

      <span className={styles.regionHint}>
        {isZh ? "所有链接须以 https:// 开头，可留空。" : "All links must start with https://. Empty values are allowed."}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  placeholder,
  isZh,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  isZh: boolean;
  onChange: (v: string) => void;
}) {
  const trimmed = value.trim();
  const invalid = trimmed.length > 0 && !URL_REGEX.test(trimmed);
  return (
    <div className={styles.field}>
      <label className={styles.label}>{label}</label>
      <input
        type="url"
        className={styles.input}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {invalid ? <span className={styles.errorText}>{isZh ? "须以 https:// 开头" : "Must start with https://"}</span> : null}
    </div>
  );
}
