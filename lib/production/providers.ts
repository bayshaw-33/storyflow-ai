import type { ProductionAspectRatio, ProductionProviderSettings } from "./types";

export const productionImageProviders = [
  { id: "minimax", label: "MiniMax" },
  { id: "seedream", label: "Seedream" },
  { id: "openai", label: "OpenAI" },
  { id: "local", label: "Local fallback" },
] as const;

export const productionVideoProviders = [
  { id: "minimax", label: "MiniMax" },
  { id: "seedance", label: "Seedance" },
  { id: "runway", label: "Runway" },
  { id: "kling", label: "Kling" },
] as const;

export const defaultProductionProviders: ProductionProviderSettings = {
  imageProvider: "minimax",
  videoProvider: "minimax",
  imageModel: "MiniMax image",
  videoModel: "MiniMax-Hailuo-02",
};

export function mapProductionVideoResolution(aspectRatio: ProductionAspectRatio) {
  if (aspectRatio === "16:9") return "1080P";
  if (aspectRatio === "1:1") return "768P";
  return "768P";
}

export function parseShotDurationSeconds(duration = "5s") {
  const match = duration.match(/(\d+(?:\.\d+)?)/);
  const value = match ? Number(match[1]) : 5;
  return Number.isFinite(value) && value > 0 ? value : 5;
}
