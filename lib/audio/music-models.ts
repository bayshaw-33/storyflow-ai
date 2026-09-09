export type AtlasCloudMusicModelId = "minimax/music-3.0" | "suno/chirp-v5";

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
    id: "suno/chirp-v5",
    provider: "atlascloud",
    kind: "music",
    labelZh: "Suno V5",
    labelEn: "Suno V5",
    descriptionZh: "使用当前歌词和曲风提示词生成歌曲",
    descriptionEn: "Generate a song from the current lyrics and style prompt",
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
  return "minimax/music-3.0";
}
