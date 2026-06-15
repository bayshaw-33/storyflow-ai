import type { PlanId } from "@/lib/billing/plans";

export type DraftCreditAddon = {
  id: "extra_draft_script_credit";
  name: string;
  description: string;
  priceUsd: number;
  availableTo: PlanId[];
  model: "DeepSeek only";
};

export type KkCreditPack = {
  id: "spark_pack" | "creator_pack" | "studio_pack" | "production_pack";
  name: string;
  kkCredits: number;
  priceUsd: number;
  availableTo: PlanId[];
};

export const EXTRA_DRAFT_SCRIPT_CREDIT: DraftCreditAddon = {
  id: "extra_draft_script_credit",
  name: "Extra Draft Script Credit",
  description: "1 complete 60-80 episode Chinese draft script",
  priceUsd: 4.9,
  availableTo: ["elite", "pro", "universe"],
  model: "DeepSeek only",
};

export const KK_CREDIT_PACKS: KkCreditPack[] = [
  {
    id: "spark_pack",
    name: "Spark Pack",
    kkCredits: 1000,
    priceUsd: 6.9,
    availableTo: ["pro", "universe", "team"],
  },
  {
    id: "creator_pack",
    name: "Orbit Pack",
    kkCredits: 5000,
    priceUsd: 24.9,
    availableTo: ["pro", "universe", "team"],
  },
  {
    id: "studio_pack",
    name: "Nebula Pack",
    kkCredits: 15000,
    priceUsd: 69.9,
    availableTo: ["pro", "universe", "team"],
  },
  {
    id: "production_pack",
    name: "Production Pack",
    kkCredits: 50000,
    priceUsd: 199,
    availableTo: ["pro", "universe", "team"],
  },
];

export const ADDON_RULES = {
  elite: "Elite can only buy Extra Draft Script Credit. Elite cannot buy KK coin packs because advanced features are not unlocked.",
  proUniverseTeam: "Pro, Universe, and Team can buy KK coin packs for platform GPT and image usage.",
  bringYourOwnApi: "Using the user's own API does not consume platform KK coins. The user pays their own model provider directly.",
} as const;
