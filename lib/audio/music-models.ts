export type AtlasCloudMusicModelId = "minimax/music-3.0" | "suno/chirp-v6" | "suno/chirp-v6-wild" | "suno/chirp-v6-mini";

export type AtlasCloudMusicModel = {
  id: AtlasCloudMusicModelId;
  provider: "atlascloud";
  kind: "music";
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  available: boolean;
};

export const ATLAS_CLOUD_MUSIC_MODELS: readonly Omit<AtlasCloudMusicModel, "available">[] = [
  {
    id: "minimax/music-3.0",
    provider: "atlascloud",
    kind: "music",
    labelZh: "MiniMax Music 3.0",
    labelEn: "MiniMax Music 3.0",
    descriptionZh: "歌词、曲风提示词或纯音乐均可生成",
    descriptionEn: "Lyrics, style prompts, or instrumental music",
  },
  {
    id: "suno/chirp-v6",
    provider: "atlascloud",
    kind: "music",
    labelZh: "Suno V6",
    labelEn: "Suno V6",
    descriptionZh: "旗舰模型，稳定、精准地生成正式歌曲",
    descriptionEn: "Flagship model for precise, polished song generation",
  },
  {
    id: "suno/chirp-v6-wild",
    provider: "atlascloud",
    kind: "music",
    labelZh: "Suno V6 Wild",
    labelEn: "Suno V6 Wild",
    descriptionZh: "实验模式，探索更大胆和不可预测的方向",
    descriptionEn: "Experimental mode for bolder, less predictable ideas",
  },
  {
    id: "suno/chirp-v6-mini",
    provider: "atlascloud",
    kind: "music",
    labelZh: "Suno V6 Mini",
    labelEn: "Suno V6 Mini",
    descriptionZh: "更快的轻量模型，适合草稿和快速试错",
    descriptionEn: "Faster, lighter model for drafts and quick iteration",
  },
];

export function getAtlasCloudMusicModels(): AtlasCloudMusicModel[] {
  const available = Boolean(process.env.ATLASCLOUD_API_KEY);
  return ATLAS_CLOUD_MUSIC_MODELS.map((model) => ({ ...model, available }));
}

export function isAtlasCloudMusicModel(value: unknown): value is AtlasCloudMusicModelId {
  return ATLAS_CLOUD_MUSIC_MODELS.some((model) => model.id === value);
}

export function getDefaultAtlasCloudMusicModel(): AtlasCloudMusicModelId {
  return "suno/chirp-v6-mini";
}
