export type SingerProfile = {
  id: string;
  displayName: string;
  gender: string;
  genres: string[];
  voiceTexture: string[];
  delivery: string[];
  language: string[];
  safePromptTerms: string[];
  forbiddenOutputTerms: string[];
  notes: string;
};

export const SONG_SINGER_LIBRARY_STORAGE_KEY = "kiikis-song-singer-library-v1";
export const SONG_SINGER_HANDOFF_STORAGE_KEY = "kiikis-song-singer-handoff-v1";
export const SONG_WORKBENCH_STORAGE_KEY = "kiikis-song-workbench-v1";

export const defaultSingers: SingerProfile[] = [
  {
    id: "dry-sarcastic-male",
    displayName: "Dry Sarcastic Male Vocal",
    gender: "male",
    genres: ["indie pop", "rock"],
    voiceTexture: ["dry", "tired", "warm"],
    delivery: ["sarcastic", "spoken-sung", "emotional"],
    language: ["English"],
    safePromptTerms: ["male indie pop vocal", "dry sarcastic delivery", "spoken-sung phrasing"],
    forbiddenOutputTerms: [],
    notes: "Good for Monday burnout, dark humor, and self-aware verses.",
  },
  {
    id: "velvet-rnb-female",
    displayName: "Velvet R&B Female Vocal",
    gender: "female",
    genres: ["R&B", "Soul", "Pop"],
    voiceTexture: ["smooth", "warm", "airy"],
    delivery: ["intimate delivery", "soft runs", "melodic hook"],
    language: ["English", "Chinese"],
    safePromptTerms: ["female smooth R&B vocal", "warm emotional delivery", "melodic hook phrasing"],
    forbiddenOutputTerms: [],
    notes: "Good for romantic, nocturnal, and intimate songs.",
  },
];

export const emptySingerDraft: SingerProfile = {
  id: "",
  displayName: "",
  gender: "custom",
  genres: [],
  voiceTexture: [],
  delivery: [],
  language: ["English"],
  safePromptTerms: [],
  forbiddenOutputTerms: [],
  notes: "",
};

export function uniqueSingerProfiles(singers: SingerProfile[]) {
  const seen = new Set<string>();
  return singers.filter((singer) => {
    const key = `${singer.displayName}|${singer.safePromptTerms.join("|")}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function cloneSinger(singer: SingerProfile): SingerProfile {
  return {
    ...singer,
    genres: [...singer.genres],
    voiceTexture: [...singer.voiceTexture],
    delivery: [...singer.delivery],
    language: [...singer.language],
    safePromptTerms: [...singer.safePromptTerms],
    forbiddenOutputTerms: [...singer.forbiddenOutputTerms],
  };
}

export function normalizeSingerDraft(singer: SingerProfile): SingerProfile {
  return {
    ...singer,
    id: singer.id || `manual-${Date.now()}`,
    displayName: singer.displayName.trim(),
    gender: singer.gender.trim() || "custom",
    genres: singer.genres.map((value) => value.trim()).filter(Boolean),
    voiceTexture: singer.voiceTexture.map((value) => value.trim()).filter(Boolean),
    delivery: singer.delivery.map((value) => value.trim()).filter(Boolean),
    language: singer.language.map((value) => value.trim()).filter(Boolean),
    safePromptTerms: singer.safePromptTerms.map((value) => value.trim()).filter(Boolean),
    forbiddenOutputTerms: singer.forbiddenOutputTerms.map((value) => value.trim()).filter(Boolean),
    notes: singer.notes.trim(),
  };
}

export function formatSingerProfile(singer: SingerProfile) {
  return [
    `Name: ${singer.displayName}`,
    `Gender: ${singer.gender}`,
    `Language: ${singer.language.join(", ")}`,
    `Genres: ${singer.genres.join(", ")}`,
    `Voice texture: ${singer.voiceTexture.join(", ")}`,
    `Delivery: ${singer.delivery.join(", ")}`,
    `Safe prompt terms: ${singer.safePromptTerms.join(", ")}`,
    `Reference / blocked terms: ${singer.forbiddenOutputTerms.join(", ")}`,
    `Notes: ${singer.notes}`,
  ].join("\n");
}
