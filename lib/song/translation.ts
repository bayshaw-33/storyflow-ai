import type { ByoApiConfig } from "@/lib/ai/prompts";

export type LyricsTranslationLanguage = "Chinese" | "English" | "Spanish" | "French" | "Japanese" | "Korean";

type LyricsTranslationRequest = {
  accessToken: string;
  projectTitle: string;
  sourceLyrics: string;
  targetLanguage: LyricsTranslationLanguage;
  signal: AbortSignal;
  byoApi?: ByoApiConfig | null;
  fetcher?: typeof fetch;
};

type LyricsTranslationResponse = {
  success?: boolean;
  error?: string;
  output?: string;
};

export async function requestLyricsTranslation({
  accessToken,
  projectTitle,
  sourceLyrics,
  targetLanguage,
  signal,
  byoApi,
  fetcher = fetch,
}: LyricsTranslationRequest) {
  const response = await fetcher("/api/ai/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      taskType: "translation",
      projectTitle: `${projectTitle || "Song"} lyrics translation`,
      input: [
        `Translate these song lyrics into ${targetLanguage}.`,
        "Preserve section tags, line breaks, repeated hooks, and singing rhythm. Output only the translated lyrics.",
        "",
        sourceLyrics,
      ].join("\n"),
      options: { targetLanguage },
      context: "This is a song lyric translation preview inside Kiikis Song Workbench.",
      byoApi,
    }),
    signal,
  });

  const text = await response.text();
  let payload: LyricsTranslationResponse = {};
  try {
    payload = text ? JSON.parse(text) as LyricsTranslationResponse : {};
  } catch {
    payload = { error: text.slice(0, 240) };
  }

  if (!response.ok || !payload.success) {
    throw new Error(payload.error || "Translation failed.");
  }

  const output = payload.output?.trim() || "";
  if (!output) throw new Error("Empty translation returned.");
  return output;
}
