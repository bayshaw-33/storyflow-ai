export type PlanId = "free" | "elite" | "pro" | "universe" | "team" | "enterprise";

export type ModelAccess = {
  deepseek: boolean;
  gpt: boolean;
  image: boolean;
  minimaxFallback: boolean;
  bringYourOwnApi: boolean;
};

export type PlanEntitlement = {
  id: PlanId;
  name: string;
  positioning: string;
  positioningZh: string;
  model: string;
  originalMonthlyPrice: number | null;
  launchMonthlyPrice: number | null;
  launchAnnualMonthlyEquivalent: number | null;
  draftScriptCreditsMonthly: number | null;
  kkCreditsMonthly: number | null;
  mediaKkLimitMonthly: number | null;
  storySeeds: number | null;
  annualSavings: string | null;
  launchState?: "available" | "coming-soon" | "contact";
  modelAccess: ModelAccess;
  includes: string[];
  excludes?: string[];
  futureDirection?: string[];
  features: {
    fullDraftScript: boolean;
    localization: boolean;
    marketEvaluation: boolean;
    advancedPolish: boolean;
    imageGeneration: boolean;
    relationshipGraph: boolean;
    storyboard: boolean;
    universe: boolean;
    lightPlanet: boolean;
    customWorkflow: boolean;
    providerSettings: boolean;
    teamWorkspace: boolean;
  };
};

const deepSeekOnly: ModelAccess = {
  deepseek: true,
  gpt: false,
  image: false,
  minimaxFallback: false,
  bringYourOwnApi: false,
};

const productionModels: ModelAccess = {
  deepseek: true,
  gpt: true,
  image: true,
  minimaxFallback: true,
  bringYourOwnApi: true,
};

const noFeatures: PlanEntitlement["features"] = {
  fullDraftScript: false,
  localization: false,
  marketEvaluation: false,
  advancedPolish: false,
  imageGeneration: false,
  relationshipGraph: false,
  storyboard: false,
  universe: false,
  lightPlanet: false,
  customWorkflow: false,
  providerSettings: false,
  teamWorkspace: false,
};

export const LAUNCH_OFFER_EN = "Launch Offer: Save 40% for your first 3 months. Save another 20% with annual billing.";
export const LAUNCH_OFFER_ZH = "上线测试优惠：前三个月 6 折。年付在此基础上再享 8 折。";

export const PLAN_ENTITLEMENTS: PlanEntitlement[] = [
  {
    id: "free",
    name: "Free",
    positioning: "Try the first sparks.",
    positioningZh: "免费体验基础创作。",
    model: "DeepSeek only",
    originalMonthlyPrice: 0,
    launchMonthlyPrice: 0,
    launchAnnualMonthlyEquivalent: 0,
    draftScriptCreditsMonthly: null,
    kkCreditsMonthly: null,
    mediaKkLimitMonthly: null,
    storySeeds: 2,
    annualSavings: "$0",
    modelAccess: deepSeekOnly,
    includes: ["2 Story Seeds", "DeepSeek only", "up to 10 trial episodes"],
    excludes: ["full 60-80 episode draft", "GPT localization", "image generation", "Universe", "bring your own API"],
    features: noFeatures,
  },
  {
    id: "elite",
    name: "Elite",
    positioning: "High-output draft writing.",
    positioningZh: "低价高产，专注完整中文初稿。",
    model: "DeepSeek only",
    originalMonthlyPrice: 21,
    launchMonthlyPrice: 12.6,
    launchAnnualMonthlyEquivalent: 9.9,
    draftScriptCreditsMonthly: 3,
    kkCreditsMonthly: null,
    mediaKkLimitMonthly: null,
    storySeeds: null,
    annualSavings: "20% annual discount after launch discount",
    modelAccess: deepSeekOnly,
    includes: ["3 Draft Script Credits / month", "DeepSeek only", "complete Chinese draft script", "watermark-free export"],
    excludes: ["GPT localization", "GPT market evaluation", "image generation", "Universe", "bring your own API"],
    features: { ...noFeatures, fullDraftScript: true },
  },
  {
    id: "pro",
    name: "Pro",
    positioning: "Full production tools with your own engine.",
    positioningZh: "解锁完整生产功能，自带 API，自定义工作流。",
    model: "DeepSeek + GPT + Image / BYO API",
    originalMonthlyPrice: 21,
    launchMonthlyPrice: 12.6,
    launchAnnualMonthlyEquivalent: 9.9,
    draftScriptCreditsMonthly: 1,
    kkCreditsMonthly: 1000,
    mediaKkLimitMonthly: null,
    storySeeds: null,
    annualSavings: "20% annual discount after launch discount",
    modelAccess: productionModels,
    includes: ["1 Draft Script Credit / month", "1000 KK币 / month", "GPT localization", "image generation", "bring your own API"],
    features: {
      ...noFeatures,
      fullDraftScript: true,
      localization: true,
      marketEvaluation: true,
      advancedPolish: true,
      imageGeneration: true,
      relationshipGraph: true,
      storyboard: true,
      customWorkflow: true,
      providerSettings: true,
    },
  },
  {
    id: "universe",
    name: "Universe",
    positioning: "Full production engine plus your story universe.",
    positioningZh: "完整生产能力 + 长期 IP 宇宙。",
    model: "DeepSeek + GPT + Image / BYO API",
    originalMonthlyPrice: 104,
    launchMonthlyPrice: 62.4,
    launchAnnualMonthlyEquivalent: 49.9,
    draftScriptCreditsMonthly: 8,
    kkCreditsMonthly: 15000,
    mediaKkLimitMonthly: 5000,
    storySeeds: null,
    annualSavings: "20% annual discount after launch discount",
    modelAccess: productionModels,
    includes: ["8 Draft Script Credits / month", "15000 KK币 / month", "Media limit: 5000 KK币 / month", "Universe enabled", "Light the Planet"],
    features: {
      ...noFeatures,
      fullDraftScript: true,
      localization: true,
      marketEvaluation: true,
      advancedPolish: true,
      imageGeneration: true,
      relationshipGraph: true,
      storyboard: true,
      universe: true,
      lightPlanet: true,
      customWorkflow: true,
      providerSettings: true,
    },
  },
  {
    id: "team",
    name: "Team",
    positioning: "Shared production workspace for teams.",
    positioningZh: "团队协作空间，即将开放。",
    model: "Coming Soon / Contact Us",
    originalMonthlyPrice: null,
    launchMonthlyPrice: null,
    launchAnnualMonthlyEquivalent: null,
    draftScriptCreditsMonthly: null,
    kkCreditsMonthly: null,
    mediaKkLimitMonthly: null,
    storySeeds: null,
    annualSavings: null,
    launchState: "coming-soon",
    modelAccess: productionModels,
    includes: ["Coming Soon", "Contact Us"],
    futureDirection: ["team workspace", "shared projects", "shared Universe", "roles and permissions"],
    features: { ...noFeatures, teamWorkspace: true },
  },
  {
    id: "enterprise",
    name: "Enterprise",
    positioning: "Custom production infrastructure for organizations.",
    positioningZh: "企业级定制方案。",
    model: "Custom / Contact Us",
    originalMonthlyPrice: null,
    launchMonthlyPrice: null,
    launchAnnualMonthlyEquivalent: null,
    draftScriptCreditsMonthly: null,
    kkCreditsMonthly: null,
    mediaKkLimitMonthly: null,
    storySeeds: null,
    annualSavings: null,
    launchState: "contact",
    modelAccess: productionModels,
    includes: ["Custom", "Contact Us"],
    futureDirection: ["custom KK币 pool", "custom model routing", "SSO", "private deployment options"],
    features: {
      ...noFeatures,
      fullDraftScript: true,
      localization: true,
      marketEvaluation: true,
      advancedPolish: true,
      imageGeneration: true,
      relationshipGraph: true,
      storyboard: true,
      universe: true,
      lightPlanet: true,
      customWorkflow: true,
      providerSettings: true,
      teamWorkspace: true,
    },
  },
];

export const DEFAULT_PLAN_ID: PlanId = "free";

export function getPlanEntitlement(planId: PlanId | string | null | undefined) {
  return PLAN_ENTITLEMENTS.find((plan) => plan.id === planId) || PLAN_ENTITLEMENTS[0];
}

export function formatLaunchPrice(value: number | null) {
  if (value === null) return "Custom";
  if (value === 0) return "$0";
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}`;
}
