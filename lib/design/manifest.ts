// KIIKIS UI OS - deterministic asset manifest.
// Components reference tokens, not raw filenames. Values map to /public/design.
// All filenames are ASCII-only (no spaces / non-latin / double extension) so
// they resolve identically on local dev and on Vercel's Linux + CDN edge.

const HERO = "/design/hero";
const LOGO = "/design/logo";
const WORKSPACE = "/design/workspace";
const UNIVERSE = "/design/universe";
const KK = "/design/kk";

export const ASSET = {
  HERO_BACKDROP: `${HERO}/deep-space-background.png`,
  HERO_ENVIRONMENT: `${HERO}/hero-environment.png`,
  HERO_STARFIELD: `${HERO}/starfield.png`,
  HERO_NEBULA: `${HERO}/nebula.png`,
  HERO_ATMOSPHERE: `${HERO}/atmosphere-cyan.png`,
  HERO_MAIN: `${HERO}/hero-main.png`,

  LOGO_PRIMARY: `${LOGO}/logo-transparent.png`,
  LOGO_ICON: `${LOGO}/logo-icon.png`,

  WORKSPACE_PROJECTS: `${WORKSPACE}/projects-card.png`,
  WORKSPACE_CHARACTERS: `${WORKSPACE}/characters-card.png`,
  WORKSPACE_STORY_BIBLE: `${WORKSPACE}/story-bible-card.png`,
  WORKSPACE_SCRIPTS: `${WORKSPACE}/scripts-card.png`,
  WORKSPACE_STORYBOARD: `${WORKSPACE}/storyboard-card.png`,
  WORKSPACE_DELIVERY: `${WORKSPACE}/delivery-card.png`,
  WORKSPACE_SETTINGS: `${WORKSPACE}/settings-card.png`,

  UNIVERSE_MAP: `${UNIVERSE}/universe-map.png`,
  UNIVERSE_TEXTURE: `${UNIVERSE}/texture-pack.png`,
  UNIVERSE_STORY_NODE: `${UNIVERSE}/story-graph-node.png`,
  UNIVERSE_WORLD_CARD: `${UNIVERSE}/world-card.png`,
  UNIVERSE_EXPLORATION_WIDGET: `${UNIVERSE}/exploration-widgets.png`,
  UNIVERSE_FLAGSHIP: `${UNIVERSE}/universe-flagship-card.png`,
  UNIVERSE_FILTER_TABS: `${UNIVERSE}/filter-tab-states.png`,
  UNIVERSE_BADGES: `${UNIVERSE}/badge-system.png`,
  UNIVERSE_TIER_ICONS: `${UNIVERSE}/tier-icons.png`,
  UNIVERSE_PRICING_GLASS: `${UNIVERSE}/pricing-glass-texture.png`,

  KK_CARD_CLASSIC_BRAVE_CN: `${KK}/kk_card_classic_brave_cn.png`,
  KK_CARD_CLASSIC_BRAVE_EN: `${KK}/kk_card_classic_brave_en.png`,
  KK_CARD_CYBER_EPIC_CN: `${KK}/kk_card_cyber_epic_cn.png`,
  KK_CARD_CYBER_EPIC_EN: `${KK}/kk_card_cyber_epic_en.png`,
  KK_CARD_VAMPIRE_LEGEND_CN: `${KK}/kk_card_vampire_legend_cn.png`,
  KK_CARD_VAMPIRE_LEGEND_EN: `${KK}/kk_card_vampire_legend_en.png`,
  KK_CARD_BACK: `${KK}/kk_card_back.png`,
} as const;

export type AssetToken = keyof typeof ASSET;
export type LayerName = "background" | "depth" | "overlay" | "foreground" | "ui";

const encodedUrlCache = new Map<AssetToken, string>();

export function assetUrl(token: AssetToken): string {
  const cached = encodedUrlCache.get(token);
  if (cached) return cached;

  const encoded = encodeURI(ASSET[token]);
  encodedUrlCache.set(token, encoded);
  return encoded;
}

export function isHeroPriorityAsset(token: AssetToken): boolean {
  return token === "HERO_MAIN" || token === "HERO_BACKDROP";
}

export const HERO_STACK: { token: AssetToken; layer: LayerName }[] = [
  { token: "HERO_BACKDROP", layer: "background" },
  { token: "HERO_ENVIRONMENT", layer: "depth" },
  { token: "HERO_STARFIELD", layer: "overlay" },
  { token: "HERO_NEBULA", layer: "overlay" },
  { token: "HERO_ATMOSPHERE", layer: "overlay" },
  { token: "HERO_MAIN", layer: "foreground" },
];

export type WorkspaceModuleId =
  | "projects"
  | "characters"
  | "story-bible"
  | "scripts"
  | "storyboard"
  | "delivery"
  | "settings";

export const WORKSPACE_MODULES: {
  id: WorkspaceModuleId;
  token: AssetToken;
  label: string;
}[] = [
  { id: "projects", token: "WORKSPACE_PROJECTS", label: "Projects" },
  { id: "characters", token: "WORKSPACE_CHARACTERS", label: "Characters" },
  { id: "story-bible", token: "WORKSPACE_STORY_BIBLE", label: "Story Bible" },
  { id: "scripts", token: "WORKSPACE_SCRIPTS", label: "Scripts" },
  { id: "storyboard", token: "WORKSPACE_STORYBOARD", label: "Storyboard" },
  { id: "delivery", token: "WORKSPACE_DELIVERY", label: "Delivery" },
  { id: "settings", token: "WORKSPACE_SETTINGS", label: "Settings" },
];
