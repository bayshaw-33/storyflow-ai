// KIIKIS DX — Component Registry.
// Static, declarative metadata for the five systems. No hidden behaviour:
// dependencies, assets used, and state bindings are all enumerated here so the
// render tree is reproducible from { assets + UI_STATE + manifest }.

import type { AssetToken } from "@/lib/design/manifest";

export type ComponentMeta = {
  dependencies: string[];
  assets: AssetToken[];
  stateBindings: string[];
};

export const ComponentRegistry: Record<string, ComponentMeta> = {
  HeroSection: {
    dependencies: ["useI18n", "HERO_STACK", "DesignAssetImage"],
    assets: ["HERO_BACKDROP", "HERO_ENVIRONMENT", "HERO_STARFIELD", "HERO_NEBULA", "HERO_ATMOSPHERE", "HERO_MAIN"],
    stateBindings: ["i18n.locale"],
  },
  Workspace: {
    dependencies: ["WORKSPACE_MODULES", "DesignAssetImage", "useOS"],
    assets: [
      "WORKSPACE_PROJECTS",
      "WORKSPACE_CHARACTERS",
      "WORKSPACE_STORY_BIBLE",
      "WORKSPACE_SCRIPTS",
      "WORKSPACE_STORYBOARD",
      "WORKSPACE_DELIVERY",
      "WORKSPACE_SETTINGS",
    ],
    stateBindings: ["os.selectedWorkspaceModule"],
  },
  Universe: {
    dependencies: ["buildUniverseGraph", "DesignAssetImage", "useOS"],
    assets: [
      "UNIVERSE_MAP",
      "UNIVERSE_TEXTURE",
      "UNIVERSE_STORY_NODE",
      "UNIVERSE_WORLD_CARD",
      "UNIVERSE_EXPLORATION_WIDGET",
      "UNIVERSE_FLAGSHIP",
      "UNIVERSE_FILTER_TABS",
      "UNIVERSE_BADGES",
    ],
    stateBindings: ["os.selectedNode", "os.access.universe"],
  },
  KK: {
    dependencies: ["kk/state", "useOS", "KK3D"],
    assets: [
      "KK_CARD_BACK",
      "KK_CARD_CLASSIC_BRAVE_CN",
      "KK_CARD_CLASSIC_BRAVE_EN",
      "KK_CARD_CYBER_EPIC_CN",
      "KK_CARD_CYBER_EPIC_EN",
      "KK_CARD_VAMPIRE_LEGEND_CN",
      "KK_CARD_VAMPIRE_LEGEND_EN",
    ],
    stateBindings: ["kkState", "os.activeSystem", "os.access.fullKK"],
  },
  Pricing: {
    dependencies: ["TIERS", "DesignAssetImage"],
    assets: ["UNIVERSE_PRICING_GLASS", "UNIVERSE_FLAGSHIP", "UNIVERSE_BADGES", "UNIVERSE_TIER_ICONS"],
    stateBindings: ["os.selectedPricingTier", "os.planId"],
  },
};
