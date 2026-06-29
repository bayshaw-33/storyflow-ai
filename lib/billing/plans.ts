export type PlanId = "free" | "elite" | "pro" | "ultra";

export type PlanEntitlement = {
  id: PlanId;
  name: string;
  positioning: string;
  positioningZh: string;
  monthlyPrice: number;
  betaMonthlyPrice: number;
  annualMonthlyPrice: number;
  betaAnnualMonthlyPrice: number;
  cnyMonthlyPrice: number;
  cnyBetaMonthlyPrice: number;
  cnyAnnualMonthlyPrice: number;
  cnyBetaAnnualMonthlyPrice: number;
  kkCreditsMonthly: number;
  kkCreditsNote?: string;
  maxProjects: number;
  badge?: string;
  includes: string[];
  includesEn?: string[];
  features: {
    universe: boolean;
    modularWorkbench: boolean;
    byoApi: boolean;
    viralCreation: boolean;
  };
};

export const PLAN_ENTITLEMENTS: PlanEntitlement[] = [
  {
    id: "free",
    name: "FREE",
    positioning: "Start your creative journey",
    positioningZh: "开始你的创作旅程",
    monthlyPrice: 0,
    betaMonthlyPrice: 0,
    annualMonthlyPrice: 0,
    betaAnnualMonthlyPrice: 0,
    cnyMonthlyPrice: 0,
    cnyBetaMonthlyPrice: 0,
    cnyAnnualMonthlyPrice: 0,
    cnyBetaAnnualMonthlyPrice: 0,
    kkCreditsMonthly: 3000,
    kkCreditsNote: "新用户注册赠送，不每月重置",
    maxProjects: 2,
    includes: [
      "3,000 KK币（注册赠送）",
      "最多 2 个项目",
      "短剧 / 歌曲工作流",
      "Viral Creation 爆款工具",
    ],
    includesEn: [
      "3,000 KK coins at signup",
      "Up to 2 projects",
      "Drama and song workflows",
      "Viral Creation tool",
    ],
    features: {
      universe: false,
      modularWorkbench: false,
      byoApi: false,
      viralCreation: true,
    },
  },
  {
    id: "elite",
    name: "ELITE",
    positioning: "More power for active creators",
    positioningZh: "为高产创作者提供更多能量",
    monthlyPrice: 19.9,
    betaMonthlyPrice: 9.9,
    annualMonthlyPrice: 15.9,
    betaAnnualMonthlyPrice: 7.9,
    cnyMonthlyPrice: 148,
    cnyBetaMonthlyPrice: 74,
    cnyAnnualMonthlyPrice: 118,
    cnyBetaAnnualMonthlyPrice: 59,
    kkCreditsMonthly: 30000,
    maxProjects: 50,
    badge: "recommended",
    includes: [
      "30,000 KK币 / 月",
      "最多 50 个项目",
      "全部工作流解锁",
      "Viral Creation 爆款工具",
    ],
    includesEn: [
      "30,000 KK coins / month",
      "Up to 50 projects",
      "All workflows unlocked",
      "Viral Creation tool",
    ],
    features: {
      universe: false,
      modularWorkbench: false,
      byoApi: false,
      viralCreation: true,
    },
  },
  {
    id: "pro",
    name: "PRO",
    positioning: "Full workflow control with your own tools",
    positioningZh: "完整工作流控制，接入你自己的工具",
    monthlyPrice: 19.9,
    betaMonthlyPrice: 9.9,
    annualMonthlyPrice: 15.9,
    betaAnnualMonthlyPrice: 7.9,
    cnyMonthlyPrice: 148,
    cnyBetaMonthlyPrice: 74,
    cnyAnnualMonthlyPrice: 118,
    cnyBetaAnnualMonthlyPrice: 59,
    kkCreditsMonthly: 10000,
    maxProjects: 50,
    badge: "popular",
    includes: [
      "10,000 KK币 / 月",
      "最多 50 个项目",
      "全部工作流解锁",
      "模块化工作台自定义",
      "自接 API（BYO API）",
      "Viral Creation 爆款工具",
    ],
    includesEn: [
      "10,000 KK coins / month",
      "Up to 50 projects",
      "All workflows unlocked",
      "Modular workbench customization",
      "BYO API",
      "Viral Creation tool",
    ],
    features: {
      universe: false,
      modularWorkbench: true,
      byoApi: true,
      viralCreation: true,
    },
  },
  {
    id: "ultra",
    name: "ULTRA",
    positioning: "The complete IP universe engine",
    positioningZh: "完整 IP 宇宙引擎，创作者的终极武器",
    monthlyPrice: 49.9,
    betaMonthlyPrice: 24.9,
    annualMonthlyPrice: 39.9,
    betaAnnualMonthlyPrice: 19.9,
    cnyMonthlyPrice: 368,
    cnyBetaMonthlyPrice: 184,
    cnyAnnualMonthlyPrice: 298,
    cnyBetaAnnualMonthlyPrice: 147,
    kkCreditsMonthly: 99000,
    maxProjects: -1,
    badge: "flagship",
    includes: [
      "99,000 KK币 / 月",
      "无限项目",
      "全部工作流解锁",
      "模块化工作台自定义",
      "自接 API（BYO API）",
      "Universe Engine（IP 宇宙系统）",
      "Viral Creation 爆款工具",
    ],
    includesEn: [
      "99,000 KK coins / month",
      "Unlimited projects",
      "All workflows unlocked",
      "Modular workbench customization",
      "BYO API",
      "Universe Engine",
      "Viral Creation tool",
    ],
    features: {
      universe: true,
      modularWorkbench: true,
      byoApi: true,
      viralCreation: true,
    },
  },
];

export const DEFAULT_PLAN_ID: PlanId = "free";

export function getPlanEntitlement(planId: PlanId | string | null | undefined): PlanEntitlement {
  return PLAN_ENTITLEMENTS.find((plan) => plan.id === planId) ?? PLAN_ENTITLEMENTS[0];
}

export function formatPrice(value: number): string {
  if (value === 0) return "$0";
  return `$${value % 1 === 0 ? value.toFixed(0) : value.toFixed(1)}`;
}

export function formatCnyPrice(value: number): string {
  if (value === 0) return "免费";
  return `¥${value}`;
}

export function formatLaunchPrice(value: number | null): string {
  if (value === null) return "Custom";
  return formatPrice(value);
}
