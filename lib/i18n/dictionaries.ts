import {
  BRAND_NAME,
  PRODUCT_DESCRIPTION_EN,
  PRODUCT_DESCRIPTION_ZH,
  TAGLINE_EN,
  TAGLINE_ZH,
} from "@/lib/brand";

export type Locale = "zh-CN" | "en-US";
export type DictionaryKey =
  | "brand.name"
  | "brand.tagline"
  | "brand.description"
  | "nav.dashboard"
  | "nav.projects"
  | "nav.workflows"
  | "nav.universe"
  | "nav.subscription"
  | "nav.settings"
  | "action.createProject"
  | "action.continueScript"
  | "action.openUniverse"
  | "action.startCreating"
  | "common.loading"
  | "common.saved"
  | "common.saveFailed"
  | "common.generating"
  | "common.retry"
  | "common.upgrade"
  | "language.zh"
  | "language.en";

export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_STORAGE_KEY = "kiiskiis_locale";

export const dictionaries: Record<Locale, Record<DictionaryKey, string>> = {
  "zh-CN": {
    "brand.name": BRAND_NAME,
    "brand.tagline": TAGLINE_ZH,
    "brand.description": PRODUCT_DESCRIPTION_ZH,
    "nav.dashboard": "工作台",
    "nav.projects": "项目",
    "nav.workflows": "工作流",
    "nav.universe": "Universe Engine",
    "nav.subscription": "订阅",
    "nav.settings": "设置",
    "action.createProject": "创建原创项目",
    "action.continueScript": "剧本续写",
    "action.openUniverse": "打开 Universe",
    "action.startCreating": "开始创作",
    "common.loading": "加载中",
    "common.saved": "已保存",
    "common.saveFailed": "保存失败",
    "common.generating": "生成中",
    "common.retry": "重试",
    "common.upgrade": "升级",
    "language.zh": "中文",
    "language.en": "English",
  },
  "en-US": {
    "brand.name": BRAND_NAME,
    "brand.tagline": TAGLINE_EN,
    "brand.description": PRODUCT_DESCRIPTION_EN,
    "nav.dashboard": "Dashboard",
    "nav.projects": "Projects",
    "nav.workflows": "Workflows",
    "nav.universe": "Universe Engine",
    "nav.subscription": "Subscription",
    "nav.settings": "Settings",
    "action.createProject": "Create Project",
    "action.continueScript": "Continue Script",
    "action.openUniverse": "Open Universe",
    "action.startCreating": "Start Creating",
    "common.loading": "Loading",
    "common.saved": "Saved",
    "common.saveFailed": "Save failed",
    "common.generating": "Generating",
    "common.retry": "Retry",
    "common.upgrade": "Upgrade",
    "language.zh": "中文",
    "language.en": "English",
  },
};

export function normalizeLocale(value: string | null | undefined): Locale {
  return value === "en-US" || value === "zh-CN" ? value : DEFAULT_LOCALE;
}

export function translate(locale: Locale, key: DictionaryKey) {
  return dictionaries[locale]?.[key] || dictionaries[DEFAULT_LOCALE][key] || key;
}
