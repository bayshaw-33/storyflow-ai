import type { AssetToken } from "@/lib/design/manifest";

export type KKCardId = "classic_brave" | "cyber_epic" | "vampire_legend";
export type KKRarity = "classic" | "epic" | "legendary";

export type KKCard = {
  id: KKCardId;
  name: string;
  rarity: KKRarity;
  image_cn: AssetToken;
  image_en: AssetToken;
  isLimited: boolean;
};

export const KK_EQUIPPED_SKIN_STORAGE_KEY = "kiikis_kk_equipped_skin";
export const KK_EQUIPPED_SKIN_EVENT = "kiikis:kk-equipped-skin";
export const DEFAULT_KK_CARD_ID: KKCardId = "classic_brave";

export const KK_CARDS: KKCard[] = [
  {
    id: "classic_brave",
    name: "Classic Brave",
    rarity: "classic",
    image_cn: "KK_CARD_CLASSIC_BRAVE_CN",
    image_en: "KK_CARD_CLASSIC_BRAVE_EN",
    isLimited: false,
  },
  {
    id: "cyber_epic",
    name: "Cyber Epic",
    rarity: "epic",
    image_cn: "KK_CARD_CYBER_EPIC_CN",
    image_en: "KK_CARD_CYBER_EPIC_EN",
    isLimited: false,
  },
  {
    id: "vampire_legend",
    name: "Vampire Legend",
    rarity: "legendary",
    image_cn: "KK_CARD_VAMPIRE_LEGEND_CN",
    image_en: "KK_CARD_VAMPIRE_LEGEND_EN",
    isLimited: true,
  },
];

export function getKKCard(cardId: string | null | undefined) {
  return KK_CARDS.find((card) => card.id === cardId) || KK_CARDS[0];
}

export function kkCardImage(card: KKCard, language: "zh" | "en") {
  return language === "zh" ? card.image_cn : card.image_en;
}
