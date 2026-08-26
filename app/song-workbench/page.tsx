"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Copy, ExternalLink, Globe, Languages, Loader2, MoreHorizontal, Package, Send, Sparkles, X } from "lucide-react";
import { readByoApiConfig } from "@/lib/ai/byoClient";
import { createProject, readProjectsFromStorage, upsertProject, type DramaProject } from "@/lib/projects";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchWithAuthRetry } from "@/lib/client/v2/auth-fetch";
import { readProjectFromSupabase, readProjectsFromSupabase, upsertProjectToSupabase } from "@/lib/supabase/projects";
import { getUniverseBundle, listUniverses, saveInboxItems, type Universe, type UniverseBundle } from "@/lib/universe";
import type { CreativePackage } from "@/lib/universe/creative-package";
import { useI18n } from "@/lib/i18n/useI18n";
import { byteLength, trimPromptBytes } from "@/lib/song/prompt";
import { requestLyricsTranslation, type LyricsTranslationLanguage } from "@/lib/song/translation";
import {
  createSongUniverseLink,
  getSongUniverseLink,
  publishSongToUniverse,
  unpublishSongFromUniverse,
  updateSongUniverseLink,
  type SongUniverseLink,
  type SongUniverseRole,
} from "@/lib/song/universe-links";
import JSZip from "jszip";
import { AudioCandidates, type SongAudioCandidate } from "@/components/song-workbench/AudioCandidates";

type SongProjectType =
  | "original_song"
  | "short_video_song"
  | "ost_theme"
  | "bgm_mood"
  | "character_song"
  | "brand_song"
  | "game_anime_song"
  | "duet_song"
  | "series_song";

type OutputLanguage = "English" | "Chinese" | "Bilingual" | "Japanese" | "Korean" | "Spanish" | "French" | "Cantonese" | "Custom";
type LyricsMode = "enhanced_lyrics" | "plain_lyrics" | "no_tags";
type AuditStatus = "pass" | "low_risk" | "medium_risk" | "high_risk";
type SongModelProvider = "auto" | "deepseek";

type SongChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type SingerProfile = {
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

type SongForm = {
  title: string;
  projectType: SongProjectType;
  sourceProjectId: string;
  outputLanguage: OutputLanguage;
  customLanguage: string;
  concept: string;
  primaryEmotion: string;
  secondaryEmotions: string[];
  genres: string[];
  customGenre: string;
  selectedSingerIds: string[];
  groove: string;
  key: string;
  instruments: string[];
  customInstrument: string;
  structure: string;
  lyricsMode: LyricsMode;
};

type SongVersion = {
  id: string;
  versionNumber: number;
  changeType: string;
  summary: string;
  auditStatus: AuditStatus;
  lyrics: string;
  stylePrompt: string;
  compositionPrompt: string;
  createdAt: string;
};

type AuditItem = {
  type: string;
  severity: "low" | "medium" | "high";
  message: string;
  suggestion: string;
};

type AuditResult = {
  status: AuditStatus;
  allowCopy: boolean;
  items: AuditItem[];
};

type SaveSongProjectOptions = {
  silent?: boolean;
  lyrics?: string;
  stylePrompt?: string;
  compositionPrompt?: string;
  audit?: AuditResult | null;
};

type UploadedReference = {
  name: string;
  type: "audio" | "lyrics";
  mode: "similar_style" | "rewrite_lyrics";
  text: string;
};

const STORAGE_KEY = "kiikis-song-workbench-v1";
const MUSIC_PROMPT_MAX_BYTES = 1000;
const translationLanguages: LyricsTranslationLanguage[] = ["Chinese", "English", "Spanish", "French", "Japanese", "Korean"];

const projectTypes: Array<{ value: SongProjectType; label: string; labelEn: string; strategy: string }> = [
  { value: "original_song", label: "原创/独立歌曲", labelEn: "Original / indie song", strategy: "standard lyrics structure" },
  { value: "short_video_song", label: "短视频/竖屏歌曲", labelEn: "Short video / vertical song", strategy: "front-loaded hook" },
  { value: "ost_theme", label: "OST/主题歌曲", labelEn: "OST / theme song", strategy: "cinematic narrative lift" },
  { value: "character_song", label: "角色/IP歌曲", labelEn: "Character / IP song", strategy: "inner monologue and conflict" },
  { value: "duet_song", label: "合唱/对唱歌曲", labelEn: "Ensemble / duet song", strategy: "multi-vocal section split" },
  { value: "series_song", label: "系列/续作歌曲", labelEn: "Series / sequel song", strategy: "repeatable versions" },
  { value: "bgm_mood", label: "BGM/氛围歌曲", labelEn: "BGM / mood song", strategy: "lighter lyrics, stronger arrangement" },
  { value: "game_anime_song", label: "游戏/动漫歌曲", labelEn: "Game / anime song", strategy: "world, mission, destiny" },
  { value: "brand_song", label: "广告/品牌歌曲", labelEn: "Brand / campaign song", strategy: "clear, safe, memorable" },
];

const primaryEmotionMap: Record<string, string[]> = {
  "快乐 / 轻松": ["明亮", "自由", "俏皮", "阳光", "轻快", "庆祝感"],
  "悲伤 / 遗憾": ["怀念", "失落", "克制", "释怀", "心碎", "温柔", "孤独"],
  "浪漫 / 甜蜜": ["心动", "暧昧", "柔软", "梦幻", "亲密", "温柔"],
  "愤怒 / 反击": ["叛逆", "压抑", "爆发", "冷酷", "胜利感", "危险感", "不甘"],
  "黑暗 / 神秘": ["危险感", "迷离", "冷感", "压迫感", "性感", "复仇感", "宿命感"],
  "治愈 / 温暖": ["释怀", "安静", "希望", "陪伴感", "柔和", "明亮"],
  "热血 / 胜利": ["高能", "宣言感", "荣耀感", "反击", "释放", "大合唱感"],
  "孤独 / 空旷": ["冷清", "失重感", "夜晚感", "疏离", "空灵", "克制"],
  "性感 / 迷离": ["暧昧", "低频", "危险感", "夜晚感", "柔软", "神秘"],
  "讽刺 / 荒诞": ["幽默", "疲惫", "自嘲", "怪诞", "松弛", "丧感", "反差感"],
  "史诗 / 宿命": ["宏大", "悲壮", "神圣感", "命运感", "战争感", "终章感"],
};

const primaryEmotionOptions = [
  { value: "快乐 / 轻松", labelEn: "Happy / Easy" },
  { value: "悲伤 / 遗憾", labelEn: "Sad / Regretful" },
  { value: "浪漫 / 甜蜜", labelEn: "Romantic / Sweet" },
  { value: "愤怒 / 反击", labelEn: "Angry / Retaliatory" },
  { value: "黑暗 / 神秘", labelEn: "Dark / Mysterious" },
  { value: "治愈 / 温暖", labelEn: "Healing / Warm" },
  { value: "热血 / 胜利", labelEn: "Heroic / Victorious" },
  { value: "孤独 / 空旷", labelEn: "Lonely / Spacious" },
  { value: "性感 / 迷离", labelEn: "Sensual / Hazy" },
  { value: "讽刺 / 荒诞", labelEn: "Satirical / Absurd" },
  { value: "史诗 / 宿命", labelEn: "Epic / Fated" },
] satisfies Array<{ value: keyof typeof primaryEmotionMap; labelEn: string }>;

const genreGroups = [
  { title: "Pop", options: ["Pop", "Alt-pop", "Indie Pop", "Synth-pop", "City Pop", "K-pop", "J-pop"] },
  { title: "R&B / Soul", options: ["R&B", "Soul", "Gospel", "Ballad"] },
  { title: "Hip-hop", options: ["Hip-hop", "Trap", "Lo-fi", "Hyperpop"] },
  { title: "Electronic", options: ["EDM", "House", "Synthwave", "Dancehall"] },
  { title: "Rock / Folk", options: ["Rock", "Pop Rock", "Folk Pop", "Country"] },
  { title: "Global / Screen", options: ["Afrobeats", "Latin Pop", "Reggae", "Cinematic", "Musical", "Dark Pop"] },
];
const genreOptions = genreGroups.flatMap((group) => group.options);

const grooveOptions = [
  "Not specified",
  "slow ballad, 60-75 BPM",
  "mid-tempo pop, 76-95 BPM",
  "light upbeat groove, 96-115 BPM",
  "dance groove, 116-128 BPM",
  "high-energy fast song, 129-150 BPM",
  "trap / hip-hop half-time groove",
  "lo-fi pocket, 65-85 BPM",
  "afrobeats / dancehall groove",
  "offbeat reggae-inspired groove",
  "cinematic gradual build",
];

const keyOptions = ["Not specified", "C major", "D major", "E major", "F major", "G major", "A major", "B major", "A minor", "B minor", "C minor", "D minor", "E minor", "F minor", "G minor"];
const instrumentGroups = [
  { title: "Keys", options: ["piano", "electric piano", "Rhodes"] },
  { title: "Guitars", options: ["acoustic guitar", "clean electric guitar", "distorted electric guitar", "reggae offbeat guitar"] },
  { title: "Bass", options: ["808 bass", "synth bass", "warm bass guitar", "fuzzy bassline"] },
  { title: "Drums", options: ["soft drums", "trap drums", "lo-fi drums", "live drums"] },
  { title: "Orchestral / Vocal", options: ["strings", "choir", "pads"] },
  { title: "Texture / Synth", options: ["ambient textures", "vinyl noise", "analog synth", "arpeggiator", "glitch effects", "vocoder"] },
];
const instrumentOptions = instrumentGroups.flatMap((group) => group.options);
const structureOptions = ["Not specified", "Standard song structure", "Short-video hook first", "OST gradual build", "BGM light-lyrics structure", "Rap + Chorus structure", "Duet structure", "Ensemble structure"];
const genreInstrumentPresets: Record<string, string[]> = {
  Pop: ["piano", "synth bass", "soft drums"],
  "Alt-pop": ["electric piano", "synth bass", "analog synth"],
  "Indie Pop": ["electric piano", "warm bass guitar", "soft drums"],
  "Synth-pop": ["analog synth", "synth bass", "arpeggiator"],
  "City Pop": ["Rhodes", "warm bass guitar", "clean electric guitar"],
  "K-pop": ["synth bass", "trap drums", "analog synth"],
  "J-pop": ["piano", "clean electric guitar", "live drums"],
  "R&B": ["Rhodes", "808 bass", "soft drums"],
  Soul: ["Rhodes", "warm bass guitar", "choir"],
  Gospel: ["piano", "choir", "live drums"],
  Ballad: ["piano", "strings", "soft drums"],
  "Hip-hop": ["808 bass", "trap drums", "electric piano"],
  Trap: ["808 bass", "trap drums", "glitch effects"],
  "Lo-fi": ["electric piano", "lo-fi drums", "vinyl noise"],
  Hyperpop: ["synth bass", "glitch effects", "vocoder"],
  EDM: ["synth bass", "analog synth", "arpeggiator"],
  House: ["synth bass", "soft drums", "electric piano"],
  Synthwave: ["analog synth", "synth bass", "arpeggiator"],
  Dancehall: ["808 bass", "reggae offbeat guitar", "soft drums"],
  Rock: ["distorted electric guitar", "warm bass guitar", "live drums"],
  "Pop Rock": ["clean electric guitar", "warm bass guitar", "live drums"],
  "Folk Pop": ["acoustic guitar", "warm bass guitar", "soft drums"],
  Country: ["acoustic guitar", "clean electric guitar", "warm bass guitar"],
  Afrobeats: ["synth bass", "soft drums", "clean electric guitar"],
  "Latin Pop": ["acoustic guitar", "warm bass guitar", "soft drums"],
  Reggae: ["reggae offbeat guitar", "warm bass guitar", "soft drums"],
  Cinematic: ["strings", "choir", "pads"],
  Musical: ["piano", "strings", "choir"],
  "Dark Pop": ["synth bass", "pads", "ambient textures"],
};

const defaultSingers: SingerProfile[] = [
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

function uniqueSingerProfiles(singers: SingerProfile[]) {
  const seen = new Set<string>();
  return singers.filter((singer) => {
    const key = `${singer.displayName}|${singer.safePromptTerms.join("|")}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cloneSinger(singer: SingerProfile) {
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

function normalizeSingerDraft(singer: SingerProfile) {
  const displayName = singer.displayName.trim();
  return {
    ...singer,
    id: singer.id || `manual-${Date.now()}`,
    displayName,
    gender: singer.gender.trim() || "custom",
    genres: singer.genres.filter(Boolean),
    voiceTexture: singer.voiceTexture.filter(Boolean),
    delivery: singer.delivery.filter(Boolean),
    language: singer.language.filter(Boolean),
    safePromptTerms: singer.safePromptTerms.filter(Boolean),
    forbiddenOutputTerms: singer.forbiddenOutputTerms.filter(Boolean),
    notes: singer.notes.trim(),
  };
}

function formatSingerProfile(singer: SingerProfile) {
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

function normalizeStoredForm(value: SongForm) {
  const normalizedStructure = value.structure === ["Standard Su", "no song structure"].join("")
    ? "Standard song structure"
    : value.structure;

  return {
    ...value,
    sourceProjectId: value.sourceProjectId || "",
    lyricsMode: (value.lyricsMode as string) === ["su", "no_enhanced"].join("") ? "enhanced_lyrics" : value.lyricsMode,
    primaryEmotion: value.primaryEmotion === ["燃", " / 胜利"].join("") ? "热血 / 胜利" : value.primaryEmotion,
    groove: value.groove === "mid-tempo pop, 76-95 BPM" ? "Not specified" : value.groove,
    key: value.key === "G minor" ? "Not specified" : value.key,
    instruments: withGenreInstrumentDefaults(value.genres || [], value.instruments || []),
    structure: normalizedStructure === "Standard song structure" ? "Not specified" : normalizedStructure,
    selectedSingerIds: [],
    secondaryEmotions: [],
  };
}

const initialForm: SongForm = {
  title: "",
  projectType: "original_song",
  sourceProjectId: "",
  outputLanguage: "English",
  customLanguage: "",
  concept: "",
  primaryEmotion: "讽刺 / 荒诞",
  secondaryEmotions: [],
  genres: ["Lo-fi", "Indie Pop", "Pop Rock"],
  customGenre: "",
  selectedSingerIds: [],
  groove: "Not specified",
  key: "Not specified",
  instruments: withGenreInstrumentDefaults(["Lo-fi", "Indie Pop", "Pop Rock"], ["electric piano", "fuzzy bassline", "lo-fi drums"]),
  customInstrument: "",
  structure: "Not specified",
  lyricsMode: "enhanced_lyrics",
};

const emptySingerDraft: SingerProfile = {
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

const i18n = {
  "en-US": {
    title: "Song Creation",
    subtitle: "Create platform-ready lyrics and style prompts. No audio generation or account connection.",
    setup: "Idea Zone",
    tools: "Tool Zone",
    singerLibrary: "Singer library",
    advanced: "Advanced music settings",
    outputs: "Creation Zone",
    audit: "Lyrics Audit",
    revision: "Revision",
    history: "Version history",
    titleField: "Project title",
    projectType: "Project type",
    outputLanguage: "Output language",
    concept: "Song concept",
    primaryEmotion: "Primary emotion",
    genres: "Target genres",
    singers: "Singer tags",
    generate: "Generate Idea",
    generating: "Generating",
    saveVersion: "Save Version",
    saving: "Saving",
    saveToProjects: "Save to Workspace",
    savedToProjects: "Saved to Workspace.",
    savedLocalOnly: "Saved locally. Cloud sync will work after the Supabase setup is complete.",
    cloudSyncFailed: "Cloud sync failed",
    saveToProjectsHint: "Saved songs appear in your Workspace and can become Universe sources — fueling characters, worlds, and OSTs across every other workflow.",
    copy: "Copy",
    lyrics: "Lyrics",
    stylePrompt: "Style prompt",
    singerDetails: "Singer details",
    newSinger: "New singer",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    close: "Close",
    referenceArtist: "Reference singer",
    safePromptTerms: "Safe prompt terms",
    forbiddenOutputTerms: "Reference / blocked terms",
    voiceTexture: "Voice texture",
    delivery: "Delivery",
    language: "Language",
    gender: "Gender",
    notes: "Notes",
    createSinger: "Create singer tag",
    fromReference: "Generate safe tag from reference",
    referencePlaceholder: "Reference artist name, used internally only",
    add: "Add",
    required: "Tell KK your idea first, or enter a project title.",
    signInRequired: "Please sign in before using AI generation.",
    noVersions: "No versions yet. Every save creates a branch you can return to.",
    auditPass: "Audit before publishing. Catches clichés, weak rhymes, tonal drift.",
    revise: "Apply Revision",
    revisionPlaceholder: "Example: make the chorus catchier while preserving the main hook.",
  },
  "zh-CN": {
    title: "歌曲创作",
    subtitle: "生成可用于音乐平台的歌词和风格提示词。不生成音频，也不连接外部账号。",
    setup: "创意区",
    tools: "工具区",
    singerLibrary: "歌手库",
    advanced: "高级音乐设定",
    outputs: "创作区",
    audit: "歌词审核",
    revision: "修改指令",
    history: "版本历史",
    titleField: "项目标题",
    projectType: "项目类型",
    outputLanguage: "输出语言",
    concept: "歌曲概念",
    primaryEmotion: "主情绪",
    genres: "目标曲风",
    singers: "歌手标签",
    generate: "生成灵感",
    generating: "生成中",
    saveVersion: "保存版本",
    saving: "保存中",
    saveToProjects: "保存到工作台",
    savedToProjects: "已保存到工作台。",
    savedLocalOnly: "已保存到本地项目列表，云端同步待配置完成后自动可用。",
    cloudSyncFailed: "云端同步失败",
    saveToProjectsHint: "已保存的歌曲会出现在工作台上，并可成为宇宙的源项目 — 为其他工作流中的角色、世界观和 OST 提供燃料。",
    copy: "复制",
    lyrics: "歌词",
    stylePrompt: "风格提示词",
    singerDetails: "歌手资料",
    newSinger: "新建歌手",
    edit: "编辑",
    delete: "删除",
    save: "保存",
    close: "关闭",
    referenceArtist: "对标歌手",
    safePromptTerms: "安全提示词",
    forbiddenOutputTerms: "对标 / 禁用词",
    voiceTexture: "声音质感",
    delivery: "演唱方式",
    language: "语言",
    gender: "性别",
    notes: "备注",
    createSinger: "创建歌手标签",
    fromReference: "通过对标歌手生成安全标签",
    referencePlaceholder: "对标歌手名，仅内部理解使用",
    add: "添加",
    required: "请先告诉 KK 您的歌曲想法，或填写一个项目标题。",
    signInRequired: "请先登录后再调用 AI 生成。",
    noVersions: "还没有版本。每保存一次，创建一个可回溯的分支。",
    auditPass: "发布前自动审核。识别陈词滥调、押韵薄弱与情绪漂移。",
    revise: "应用修订",
    revisionPlaceholder: "例如：把副歌改得更洗脑，但保留主 hook。",
  },
};

function createSongChatMessage(role: SongChatMessage["role"], content: string): SongChatMessage {
  return {
    id: `song-chat-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function createSongAssistantMessage(content: string) {
  return createSongChatMessage("assistant", content);
}

/** §7 歌曲角色标签本地化 */
function songRoleLabel(role: SongUniverseRole, isZh: boolean): string {
  const map: Record<SongUniverseRole, string> = isZh
    ? {
        theme_song: "主题曲",
        ending_song: "片尾曲",
        character_song: "角色歌",
        insert_song: "插曲",
        bgm: "BGM",
        promo_song: "宣传曲",
      }
    : {
        theme_song: "Theme song",
        ending_song: "Ending song",
        character_song: "Character song",
        insert_song: "Insert song",
        bgm: "BGM",
        promo_song: "Promo song",
      };
  return map[role] || role;
}

function getSongOpeningMessage(isZh: boolean) {
  if (!isZh) {
    return [
      "Dear creator, I am KK, your music creation assistant.",
      "You do not need to know genres, arrangement, or production terms. Tell me your feeling first:",
      "1. What kind of song do you want to make, and where will you use it?",
      "2. What emotion should listeners feel?",
      "3. What language should the lyrics use?",
      "4. Do you imagine a vocal song, BGM, OST, short-video hook, or something else?",
      "5. Any scene, reference mood, instrument, or title in mind?",
      "Creator, speak freely. I will help turn your idea into lyrics and a Suno-ready style prompt.",
    ].join("\n");
  }

  return [
    "尊敬的创作者大人，我是您的歌曲创作小助理 KK。",
    "您不需要懂曲风、编曲或音乐术语。先告诉我您的感觉：",
    "1. 您想做一首什么用途的歌？短视频、OST、BGM、角色歌，还是独立歌曲？",
    "2. 希望听众听完是什么情绪？甜、燃、孤独、治愈、性感、复仇感，还是别的？",
    "3. 歌词想用什么语言？",
    "4. 您想要有人声演唱，还是偏氛围音乐？",
    "5. 脑海里有没有画面、标题、乐器、参考感觉？不用专业，随便说就好。",
    "创作者大人，告诉我您的想法，我会帮您整理成歌词和 Suno 可用的 style 提示词。",
  ].join("\n");
}

export default function SongWorkbenchPage() {
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";
  const text = i18n[locale];
  const [form, setForm] = useState<SongForm>(initialForm);
  const [singers, setSingers] = useState<SingerProfile[]>(defaultSingers);
  const [lyrics, setLyrics] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [compositionPrompt, setCompositionPrompt] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [songDevelopmentNotes, setSongDevelopmentNotes] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<SongChatMessage[]>([]);
  const [chatGenerating, setChatGenerating] = useState(false);
  const [translationLanguage, setTranslationLanguage] = useState<LyricsTranslationLanguage>("Chinese");
  const [translatedLyrics, setTranslatedLyrics] = useState("");
  const [translationGenerating, setTranslationGenerating] = useState(false);
  const [translationError, setTranslationError] = useState("");
  const [selectedModelProvider, setSelectedModelProvider] = useState<SongModelProvider>("auto");
  const [uploadedReference, setUploadedReference] = useState<UploadedReference | null>(null);
  const [referenceMode, setReferenceMode] = useState<UploadedReference["mode"]>("similar_style");
  const [uploadingReference, setUploadingReference] = useState(false);
  const [versions, setVersions] = useState<SongVersion[]>([]);
  const [sourceProjects, setSourceProjects] = useState<DramaProject[]>([]);
  const [universes, setUniverses] = useState<Universe[]>([]);
  const [selectedUniverseId, setSelectedUniverseId] = useState("");
  const [universeBundle, setUniverseBundle] = useState<UniverseBundle | null>(null);
  const [universeBusy, setUniverseBusy] = useState(false);
  const [universeStatus, setUniverseStatus] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [songProjectId, setSongProjectId] = useState<string | null>(null);
  // P1-05：歌曲会话账本 —— 真实消息序列的事实源（storyflow_conversation_messages）
  const [ledgerWorkId, setLedgerWorkId] = useState<string | null>(null);
  const ledgerWorkIdRef = useRef<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [savingProject, setSavingProject] = useState(false);
  const [error, setError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [singerDraft, setSingerDraft] = useState<SingerProfile | null>(null);
  const loadedEntryRef = useRef("");
  // 两栏布局：右侧上下分隔比例（上方占百分比，默认 70）
  const [upperHeightPct, setUpperHeightPct] = useState(70);
  // 拖动分隔线状态
  const splitterDragging = useRef(false);
  const rightContainerRef = useRef<HTMLDivElement | null>(null);
  // 抽屉：setup / reference / universe / history / null
  const [drawerType, setDrawerType] = useState<null | "more" | "material" | "universe" | "history">(null);
  // 移动端歌词/翻译标签页
  const [mobileTab, setMobileTab] = useState<"lyrics" | "translation">("lyrics");
  // 歌词手动编辑后的"待更新"标记
  const [lyricsDirty, setLyricsDirty] = useState(false);
  // 生成失败专用错误（显示在右侧创作区，不伪造成功结果）
  const [generationError, setGenerationError] = useState("");
  // 生成进度状态文案（明确进度，禁用重复提交）
  const [generationProgress, setGenerationProgress] = useState("");
  const [audioCandidates, setAudioCandidates] = useState<SongAudioCandidate[]>([]);
  const [audioGenerating, setAudioGenerating] = useState(false);
  // 自动保存状态："idle" | "saving" | "saved" | "failed"
  const [autoSaveState, setAutoSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const [autoSaveTime, setAutoSaveTime] = useState<string>("");
  // 顶部标题内联编辑
  const [editingTitle, setEditingTitle] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  // 素材与版权：作者 / 来源 / 授权类型 / 使用限制
  const [materialAuthor, setMaterialAuthor] = useState("");
  const [materialSource, setMaterialSource] = useState("");
  const [materialLicense, setMaterialLicense] = useState("");
  const [materialUsage, setMaterialUsage] = useState("");
  // 移动端视图切换：chat | results（手机/平板竖屏双页面流程）
  const [mobileView, setMobileView] = useState<"chat" | "results">("chat");
  // 交付工作包导出状态
  const [exportingPackage, setExportingPackage] = useState(false);
  // §7 歌曲-Universe 关联（draft / published / deprecated）
  const [songUniverseLink, setSongUniverseLink] = useState<SongUniverseLink | null>(null);
  const [songUniverseBusy, setSongUniverseBusy] = useState(false);
  // 路径二/三：关联表单（歌曲角色、来源项目、继承范围）
  const [linkForm, setLinkForm] = useState<{
    songRole: SongUniverseRole;
    sourceProjectId: string;
    inheritanceScope: {
      characters: boolean;
      locations: boolean;
      canonFacts: boolean;
      timeline: boolean;
      relationships: boolean;
      styleGuide: boolean;
    };
  }>({
    songRole: "theme_song",
    sourceProjectId: "",
    inheritanceScope: {
      characters: true,
      locations: true,
      canonFacts: true,
      timeline: false,
      relationships: false,
      styleGuide: true,
    },
  });

  async function pollSongAudioJob(candidateId: string, jobId: string) {
    const accessToken = session?.access_token;
    if (!accessToken) return;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 4000));
      const response = await fetch(`/api/audio/jobs/${encodeURIComponent(jobId)}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return;
      const payload = await response.json() as { job?: { status?: SongAudioCandidate["status"]; result_url?: string | null; provider?: string; model?: string | null; error?: string | null } };
      const job = payload.job;
      if (!job) return;
      setAudioCandidates((current) => current.map((candidate) => candidate.id === candidateId ? {
        ...candidate,
        status: job.status || candidate.status,
        resultUrl: job.result_url || candidate.resultUrl,
        provider: job.provider || candidate.provider,
        model: job.model || candidate.model,
        error: job.error || candidate.error,
      } : candidate));
      if (["completed", "failed", "provider_timeout"].includes(job.status || "")) return;
    }
  }

  async function generateSongAudio() {
    if (!session?.access_token) {
      setGenerationError(isZh ? "登录后才能生成音频。" : "Sign in before generating audio.");
      return;
    }
    if (!lyrics.trim() && !stylePrompt.trim()) {
      setGenerationError(isZh ? "请先生成歌词或曲风提示词。" : "Generate lyrics or a style prompt first.");
      return;
    }
    setAudioGenerating(true);
    setGenerationError("");
    const candidateId = crypto.randomUUID();
    setAudioCandidates((current) => [{ id: candidateId, jobId: null, status: "queued", resultUrl: null, provider: null, model: null, error: null, createdAt: new Date().toISOString() }, ...current]);
    try {
      const response = await fetch("/api/audio/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({
          kind: "music",
          prompt: stylePrompt || form.concept,
          lyrics,
          targetType: "song_version",
          targetId: songProjectId || form.title || "standalone-song",
          projectId: songProjectId,
          inputParams: { title: form.title, projectType: form.projectType, language: form.outputLanguage },
        }),
      });
      const payload = await response.json() as { job?: { id: string; status: SongAudioCandidate["status"]; result_url?: string | null; provider?: string; model?: string | null; error?: string | null }; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error || "AUDIO_JOB_CREATE_FAILED");
      const job = payload.job;
      setAudioCandidates((current) => current.map((candidate) => candidate.id === candidateId ? { ...candidate, jobId: job.id, status: job.status, resultUrl: job.result_url || null, provider: job.provider || null, model: job.model || null, error: job.error || null } : candidate));
      if (!["completed", "failed", "provider_timeout"].includes(job.status)) void pollSongAudioJob(candidateId, job.id);
    } catch (audioError) {
      const message = audioError instanceof Error ? audioError.message : "AUDIO_JOB_CREATE_FAILED";
      setAudioCandidates((current) => current.map((candidate) => candidate.id === candidateId ? { ...candidate, status: "failed", error: message } : candidate));
    } finally {
      setAudioGenerating(false);
    }
  }

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const entry = getSongEntry();

    if (entry.forceNew) {
      if (loadedEntryRef.current !== "new") {
        resetSongWorkbench();
        loadedEntryRef.current = "new";
      }
      return;
    }

    if (entry.projectId) {
      const key = `project:${entry.projectId}`;
      if (loadedEntryRef.current === key) return;

      const localProject = readProjectsFromStorage().find((project) => project.id === entry.projectId);
      if (localProject) {
        applySongProject(localProject);
        loadedEntryRef.current = key;
        return;
      }

      if (session?.access_token) {
        void readProjectFromSupabase(entry.projectId, { accessToken: session.access_token }).then((cloudProject) => {
          if (cloudProject) {
            applySongProject(cloudProject);
            loadedEntryRef.current = key;
          }
        });
      }
      return;
    }

    if (loadedEntryRef.current === "draft") return;

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        loadedEntryRef.current = "draft";
        return;
      }
      const data = JSON.parse(stored);
      if (data.form) setForm(normalizeStoredForm(data.form));
      if (data.singers) setSingers(data.singers);
      if (data.lyrics) { setLyrics(data.lyrics); setLyricsDirty(false); }
      if (data.stylePrompt || data.compositionPrompt) setStylePrompt(mergeMusicPrompt(data.stylePrompt || "", data.compositionPrompt || ""));
      if (data.compositionPrompt) setCompositionPrompt("");
      if (data.audit) setAudit(data.audit);
      if (data.versions) setVersions(data.versions);
      if (data.songProjectId) setSongProjectId(data.songProjectId);
      if (data.selectedUniverseId) setSelectedUniverseId(data.selectedUniverseId);
      if (data.songDevelopmentNotes) setSongDevelopmentNotes(data.songDevelopmentNotes);
      if (data.translationLanguage) setTranslationLanguage(data.translationLanguage);
      if (data.translatedLyrics) setTranslatedLyrics(data.translatedLyrics);
      if (data.selectedModelProvider) setSelectedModelProvider(data.selectedModelProvider);
      if (data.uploadedReference) setUploadedReference(data.uploadedReference);
      if (data.referenceMode) setReferenceMode(data.referenceMode);
      loadedEntryRef.current = "draft";
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      loadedEntryRef.current = "draft";
    }
  }, [session?.access_token]);

  useEffect(() => {
    const localProjects = readProjectsFromStorage().filter(isSongSourceProject);
    setSourceProjects(localProjects);

    if (!session?.access_token) return;

    void readProjectsFromSupabase({ accessToken: session.access_token })
      .then((cloudProjects) => {
        setSourceProjects(mergeSourceProjects(localProjects, cloudProjects.filter(isSongSourceProject)));
      })
      .catch(() => {
        setSourceProjects(localProjects);
      });
  }, [session?.access_token]);

  useEffect(() => {
    void listUniverses({ accessToken: session?.access_token })
      .then((items) => {
        setUniverses(items);
      })
      .catch(() => null);
  }, [session?.access_token]);

  useEffect(() => {
    const sourceUniverseId = sourceProjects.find((project) => project.id === form.sourceProjectId)?.universeId || "";
    if (sourceUniverseId) setSelectedUniverseId(sourceUniverseId);
  }, [form.sourceProjectId, sourceProjects]);

  useEffect(() => {
    if (!selectedUniverseId) {
      setUniverseBundle(null);
      return;
    }
    void getUniverseBundle(selectedUniverseId, { accessToken: session?.access_token })
      .then((bundle) => setUniverseBundle(bundle))
      .catch(() => setUniverseBundle(null));
  }, [selectedUniverseId, session?.access_token]);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ form, singers, lyrics, stylePrompt, compositionPrompt, audit, versions, songProjectId, selectedUniverseId, songDevelopmentNotes, translationLanguage, translatedLyrics, selectedModelProvider, uploadedReference, referenceMode }),
    );
  }, [form, singers, lyrics, stylePrompt, compositionPrompt, audit, versions, songProjectId, selectedUniverseId, songDevelopmentNotes, translationLanguage, translatedLyrics, selectedModelProvider, uploadedReference, referenceMode]);

  useEffect(() => {
    if (songDevelopmentNotes.trim()) return;
    setChatMessages([createSongAssistantMessage(getSongOpeningMessage(isZh))]);
  }, [isZh, songDevelopmentNotes]);

  useEffect(() => {
    const trimmed = lyrics.trim();
    setTranslationGenerating(false);
    setTranslationError("");
    if (!trimmed) {
      setTranslatedLyrics("");
      return;
    }
    if (shouldSkipLyricsTranslation(trimmed, translationLanguage)) {
      setTranslatedLyrics(trimmed);
      return;
    }
    if (!session?.access_token) {
      setTranslatedLyrics("");
      setTranslationError(isZh ? "登录后可自动翻译歌词。" : "Sign in to auto-translate lyrics.");
      return;
    }

    setTranslatedLyrics("");
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void translateLyrics(trimmed, translationLanguage, controller.signal);
    }, 900);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [lyrics, translationLanguage, session?.access_token, isZh, selectedModelProvider, form.title]);

  function resetSongWorkbench() {
    setForm(initialForm);
    setSingers(defaultSingers);
    setLyrics("");
    setStylePrompt("");
    setCompositionPrompt("");
    setAudit(null);
    setSongDevelopmentNotes("");
    setChatInput("");
    setChatMessages([createSongAssistantMessage(getSongOpeningMessage(isZh))]);
    setTranslationLanguage("Chinese");
    setTranslatedLyrics("");
    setTranslationError("");
    setUploadedReference(null);
    setReferenceMode("similar_style");
    setVersions([]);
    setSongProjectId(null);
    setError("");
    setSaveStatus("");
    setSaveWarning("");
    setRevisionInstruction("");
    setAuditOpen(false);
    setSelectedUniverseId("");
    setUniverseBundle(null);
    setUniverseStatus("");
  }

  function applySongProject(project: DramaProject) {
    const snapshot = songProjectToWorkbench(project);
    setForm(snapshot.form);
    setLyrics(snapshot.lyrics);
    setStylePrompt(trimPromptBytes(snapshot.stylePrompt, MUSIC_PROMPT_MAX_BYTES));
    setCompositionPrompt(snapshot.compositionPrompt);
    setAudit(snapshot.audit);
    setSongDevelopmentNotes(snapshot.songDevelopmentNotes);
    setChatInput("");
    // P1-05：本地 notes 只是回退展示；真实历史由 restoreSongLedger 从会话账本
    // 按时间顺序恢复（notes 不再被压成单条"摘要"消息）。
    setChatMessages(snapshot.songDevelopmentNotes
      ? [createSongAssistantMessage(isZh ? "正在恢复这个歌曲项目的创作对话记录…" : "Restoring the saved music development conversation…")]
      : [createSongAssistantMessage(getSongOpeningMessage(isZh))]);
    void restoreSongLedger(project.id, snapshot.songDevelopmentNotes || "");
    setVersions([]);
    setSongProjectId(project.id);
    setSelectedUniverseId(project.universeId || "");
    setSongUniverseLink(null);
    setError("");
    setSaveStatus("");
    setSaveWarning("");
    setRevisionInstruction("");
    setAuditOpen(false);
  }

  // §7 加载歌曲-Universe 关联记录（基于 songProjectId）
  useEffect(() => {
    if (!songProjectId || !session?.access_token) {
      setSongUniverseLink(null);
      return;
    }
    let cancelled = false;
    void getSongUniverseLink(songProjectId, { accessToken: session.access_token })
      .then((link) => {
        if (cancelled) return;
        setSongUniverseLink(link);
        if (link) {
          setLinkForm((current) => ({
            ...current,
            songRole: link.song_role,
            sourceProjectId: link.source_project_id || "",
            inheritanceScope: {
              characters: Boolean(link.inheritance_scope.characters),
              locations: Boolean(link.inheritance_scope.locations),
              canonFacts: Boolean(link.inheritance_scope.canon_facts),
              timeline: Boolean(link.inheritance_scope.timeline),
              relationships: Boolean(link.inheritance_scope.relationships),
              styleGuide: Boolean(link.inheritance_scope.style_guide),
            },
          }));
        }
      })
      .catch(() => {
        if (!cancelled) setSongUniverseLink(null);
      });
    return () => {
      cancelled = true;
    };
  }, [songProjectId, session?.access_token]);

  async function refreshSongWorkbench() {
    setRefreshing(true);
    setError("");
    setSaveWarning("");
    try {
      const localProjects = readProjectsFromStorage();
      const localSourceProjects = localProjects.filter(isSongSourceProject);
      let cloudProjects: DramaProject[] = [];

      if (session?.access_token) {
        cloudProjects = await readProjectsFromSupabase({ accessToken: session.access_token }).catch(() => []);
      }

      setSourceProjects(mergeSourceProjects(localSourceProjects, cloudProjects.filter(isSongSourceProject)));

      const nextUniverses = await listUniverses({ accessToken: session?.access_token }).catch(() => universes);
      setUniverses(nextUniverses);

      if (songProjectId) {
        const localSong = localProjects.find((project) => project.id === songProjectId);
        const cloudSong = session?.access_token
          ? await readProjectFromSupabase(songProjectId, { accessToken: session.access_token }).catch(() => null)
          : null;
        const nextSong = cloudSong || localSong;
        if (nextSong) applySongProject(nextSong);
      } else if (selectedUniverseId) {
        const bundle = await getUniverseBundle(selectedUniverseId, { accessToken: session?.access_token }).catch(() => null);
        setUniverseBundle(bundle);
      }

      setSaveStatus(locale === "zh-CN" ? "歌曲工作台已刷新。" : "Song workbench refreshed.");
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : locale === "zh-CN" ? "刷新失败。" : "Refresh failed.");
    } finally {
      setRefreshing(false);
    }
  }

  const selectedSingers = useMemo(
    () => uniqueSingerProfiles(singers).filter((singer) => form.selectedSingerIds.includes(singer.id)),
    [form.selectedSingerIds, singers],
  );
  const selectedSourceProject = useMemo(
    () => sourceProjects.find((project) => project.id === form.sourceProjectId) || null,
    [form.sourceProjectId, sourceProjects],
  );

  const canCopyLyrics = true;
  const musicPromptBytes = byteLength(stylePrompt);

  function updateForm<K extends keyof SongForm>(key: K, value: SongForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateSourceProject(projectId: string) {
    const source = sourceProjects.find((project) => project.id === projectId);
    setForm((current) => ({
      ...current,
      sourceProjectId: projectId,
      projectType: projectId ? "ost_theme" : current.projectType,
      title: current.title || (source?.title ? `${source.title} OST` : current.title),
      concept: current.concept || (source ? buildSourceProjectSongConcept(source) : current.concept),
      genres: current.genres.length ? current.genres : (source?.genre ? splitCustom(source.genre).filter((item) => genreOptions.includes(item)) : current.genres),
      customGenre: current.customGenre || (source?.genre ? splitCustom(source.genre).filter((item) => !genreOptions.includes(item)).join(", ") : ""),
    }));
  }

  function toggleListValue<K extends "secondaryEmotions" | "genres" | "selectedSingerIds" | "instruments">(
    key: K,
    value: SongForm[K][number],
  ) {
    setForm((current) => {
      const list = current[key] as string[];
      return {
        ...current,
        [key]: list.includes(value as string) ? list.filter((item) => item !== value) : [...list, value as string],
      };
    });
  }

  function updateGenreSelection(value: string, checked: boolean) {
    setForm((current) => {
      const nextGenres = checked
        ? Array.from(new Set([...current.genres, value]))
        : current.genres.filter((item) => item !== value);
      const nextInstruments = checked
        ? Array.from(new Set([...current.instruments, ...recommendedInstrumentsForGenre(value)]))
        : current.instruments;

      return {
        ...current,
        genres: nextGenres,
        instruments: nextInstruments,
      };
    });
  }

  /**
   * P1-05：把消息追加到会话账本（append-only）。尽力而为：账本失败不阻塞
   * 对话本身，只在控制台留痕；重开时以账本为准恢复真实顺序。
   */
  async function appendSongLedgerMessage(role: "user" | "assistant", content: string, idempotencyKey: string) {
    const workId = ledgerWorkIdRef.current;
    if (!workId || !session?.access_token) return;
    try {
      await fetchWithAuthRetry(`/api/v2/works/${encodeURIComponent(workId)}/conversations/${encodeURIComponent(workId)}/messages`, {
        method: "POST",
        body: JSON.stringify({ role, content, idempotencyKey }),
      });
    } catch (error) {
      console.warn("[song-ledger] append failed (non-blocking)", error);
    }
  }

  /**
   * P1-05：重开恢复 —— 从账本按时间顺序恢复真实 user/assistant 消息；
   * 无账本记录且存在 legacy notes 时，导入一次（确定性幂等键）。
   * 失败时静默降级为本地展示（不阻塞工作台）。
   */
  async function restoreSongLedger(projectId: string, legacyNotes: string) {
    if (!session?.access_token) return;
    try {
      const resolveRes = await fetchWithAuthRetry(`/api/v2/project-start/resolve-work?projectId=${encodeURIComponent(projectId)}`);
      const resolvePayload = (await resolveRes.json().catch(() => null)) as { success?: boolean; workId?: string } | null;
      if (!resolveRes.ok || !resolvePayload?.success || !resolvePayload.workId) return;
      const workId = resolvePayload.workId;
      ledgerWorkIdRef.current = workId;
      setLedgerWorkId(workId);
      // 确保线程存在（threadId = workId，与剧本侧默认会话身份一致）
      await fetchWithAuthRetry(`/api/v2/works/${encodeURIComponent(workId)}/conversations`, {
        method: "POST",
        body: JSON.stringify({ threadId: workId, title: "歌曲创作对话" }),
      }).catch(() => undefined);
      const listRes = await fetchWithAuthRetry(`/api/v2/works/${encodeURIComponent(workId)}/conversations/${encodeURIComponent(workId)}/messages?limit=500`);
      const listPayload = (await listRes.json().catch(() => null)) as
        | { success?: boolean; messages?: Array<{ role?: string; content?: string }> }
        | null;
      let rows = listRes.ok && listPayload?.success ? (listPayload.messages ?? []) : [];
      if (rows.length === 0 && legacyNotes.trim()) {
        // legacy notes 只导入一次（幂等键跨重开稳定）
        const importRes = await fetchWithAuthRetry(`/api/v2/works/${encodeURIComponent(workId)}/conversations/${encodeURIComponent(workId)}/messages`, {
          method: "POST",
          body: JSON.stringify({
            role: "assistant",
            content: `【legacy_import】${legacyNotes.trim()}`,
            idempotencyKey: `song-legacy-import:${workId}`,
          }),
        });
        const importPayload = (await importRes.json().catch(() => null)) as { success?: boolean; message?: { role?: string; content?: string } } | null;
        if (importRes.ok && importPayload?.success && importPayload.message) rows = [importPayload.message];
      }
      if (rows.length > 0) {
        setChatMessages(rows.map((row) =>
          createSongChatMessage(row.role === "user" ? "user" : "assistant", row.content ?? ""),
        ));
      }
    } catch (error) {
      console.warn("[song-ledger] restore failed (non-blocking)", error);
    }
  }

  function validateForm() {
    return Boolean(form.title.trim() || form.concept.trim() || songDevelopmentNotes.trim());
  }

  async function sendChatMessage() {
    const trimmed = chatInput.trim();
    if (!trimmed || chatGenerating) return;

    setError("");
    setSaveStatus("");
    setChatInput("");

    const userMessage = createSongChatMessage("user", trimmed);
    setChatMessages((current) => [...current, userMessage]);
    void appendSongLedgerMessage("user", trimmed, `song-input:${userMessage.id}`);
    const notesWithUser = appendSongNotes(songDevelopmentNotes, "USER", trimmed);
    setSongDevelopmentNotes(notesWithUser);
    if (!form.concept.trim()) updateForm("concept", trimmed);

    if (!session?.access_token) {
      const reply = createSongAssistantMessage(isZh
        ? "我已经先把这条想法记录下来。登录后，我可以继续追问、归纳音乐方向，并基于对话生成歌词和 Suno style 提示词。"
        : "I saved this idea. After sign-in, I can keep asking, summarize the music direction, and generate lyrics plus a Suno style prompt from the conversation.");
      setChatMessages((current) => [...current, reply]);
      setSongDevelopmentNotes((current) => appendSongNotes(current, "AI", reply.content));
      return;
    }

    setChatGenerating(true);
    try {
      const response = await fetchWithAuthRetry("/api/ai/generate", {
        method: "POST",
        body: JSON.stringify({
          taskType: "song_development_chat",
          projectTitle: form.title || "Song development chat",
          genre: normalizedGenres(form).join(", "),
          input: trimmed,
          context: buildSongChatContext(form, notesWithUser, chatMessages, lyrics, stylePrompt, uploadedReference, selectedSourceProject, universeBundle),
          byoApi: buildSongByoApi(selectedModelProvider),
        }),
      });
      const payload = await readJsonResponse<{ success?: boolean; error?: string; output?: string }>(response);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "AI chat failed.");
      const reply = createSongAssistantMessage(payload.output || "");
      setChatMessages((current) => [...current, reply]);
      void appendSongLedgerMessage("assistant", reply.content, `song-reply:${reply.id}`);
      setSongDevelopmentNotes((current) => appendSongNotes(current, "AI", reply.content));
    } catch (chatError) {
      setError(chatError instanceof Error ? chatError.message : isZh ? "AI 对话失败。" : "AI chat failed.");
    } finally {
      setChatGenerating(false);
    }
  }

  // 聊天框直通生成：把输入作为上下文记录，但不显示为对话消息，直接调用生成
  async function generateSongFromChat() {
    const trimmed = chatInput.trim();
    if (trimmed) {
      const notesWithUser = appendSongNotes(songDevelopmentNotes, "USER", trimmed);
      setSongDevelopmentNotes(notesWithUser);
      if (!form.concept.trim()) updateForm("concept", trimmed);
      setChatInput("");
    }
    setMobileView("results");
    void generateAll();
  }

  async function translateLyrics(sourceLyrics: string, targetLanguage: LyricsTranslationLanguage, signal: AbortSignal) {
    if (!session?.access_token || signal.aborted) return;
    setTranslationGenerating(true);
    setTranslationError("");
    try {
      const output = await requestLyricsTranslation({
        accessToken: session.access_token,
        projectTitle: form.title,
        sourceLyrics,
        targetLanguage,
        signal,
        byoApi: buildSongByoApi(selectedModelProvider),
      });
      if (!signal.aborted) setTranslatedLyrics(output);
    } catch (translationError) {
      if (!signal.aborted) {
        setTranslationError(translationError instanceof Error ? translationError.message : isZh ? "翻译失败。" : "Translation failed.");
      }
    } finally {
      if (!signal.aborted) setTranslationGenerating(false);
    }
  }

  // 手动翻译：用户点击"翻译"按钮触发，使用独立的 AbortController（不依赖自动翻译的 useEffect）
  const manualTranslateAbort = useRef<AbortController | null>(null);
  async function handleManualTranslate() {
    const trimmed = lyrics.trim();
    if (!trimmed) {
      setTranslationError(isZh ? "请先生成或输入歌词。" : "Please generate or enter lyrics first.");
      return;
    }
    if (!session?.access_token) {
      setTranslationError(isZh ? "登录后可翻译歌词。" : "Sign in to translate lyrics.");
      return;
    }
    // 取消正在进行的自动翻译
    manualTranslateAbort.current?.abort();
    const controller = new AbortController();
    manualTranslateAbort.current = controller;
    await translateLyrics(trimmed, translationLanguage, controller.signal);
  }

  async function handleReferenceFileUpload(file: File | null) {
    if (!file || uploadingReference) return;
    const lowerName = file.name.toLowerCase();
    const isAudio = lowerName.endsWith(".mp3") || lowerName.endsWith(".wav");
    const isLyricsFile = lowerName.endsWith(".txt") || lowerName.endsWith(".doc") || lowerName.endsWith(".docx");
    if (!isAudio && !isLyricsFile) {
      setError(isZh ? "请上传 mp3、wav、doc、docx 或 txt 文件。" : "Upload an mp3, wav, doc, docx, or txt file.");
      return;
    }

    setUploadingReference(true);
    setError("");
    try {
      if (isAudio) {
        const note = referenceMode === "similar_style"
          ? `已上传音频参考：${file.name}（${formatFileSize(file.size)}）。用户希望创作一首类似曲风、情绪和质感的新歌。`
          : `已上传音频参考：${file.name}（${formatFileSize(file.size)}）。用户希望以该音频作为创作参考。`;
        setUploadedReference({ name: file.name, type: "audio", mode: referenceMode, text: note });
        setSongDevelopmentNotes((current) => appendSongNotes(current, "REFERENCE", note));
        setChatMessages((current) => [...current, createSongAssistantMessage(isZh
          ? `已记录音频参考：${file.name}。当前版本会把它作为创作意图和风格参考；如果您能再描述一下它的情绪、节奏或乐器，我可以整理得更准确。`
          : `Audio reference saved: ${file.name}. I will use it as a style intention; describe its mood, tempo, or instruments to make the direction sharper.`)]);
        return;
      }

      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/files/parse", { method: "POST", body: formData });
      const data = await readJsonResponse<{ success?: boolean; error?: string; text?: string; fileName?: string }>(response);
      if (!response.ok || !data.success || !data.text) throw new Error(data.error || "File parse failed.");

      const textPreview = data.text.trim();
      const note = referenceMode === "rewrite_lyrics"
        ? `已上传歌词文件：${file.name}。改编要求：保留原歌词结构和字数/行数规模，换一版全新的原创歌词。\n\n原歌词：\n${textPreview}`
        : `已上传文字参考：${file.name}。请基于其中的情绪、主题和表达方向创作歌曲。\n\n参考内容：\n${textPreview}`;
      setUploadedReference({ name: file.name, type: "lyrics", mode: referenceMode, text: textPreview });
      if (referenceMode === "rewrite_lyrics") setLyrics(textPreview);
      if (!form.concept.trim()) updateForm("concept", referenceMode === "rewrite_lyrics" ? "基于上传歌词改编，保留原结构和字数规模，换一版新的原创歌词。" : textPreview.slice(0, 500));
      setSongDevelopmentNotes((current) => appendSongNotes(current, "REFERENCE", note));
      setChatMessages((current) => [...current, createSongAssistantMessage(isZh
        ? `已读取歌词/文字文件：${file.name}。我会把它作为本次创作参考，生成时按您的模式处理。`
        : `Text file loaded: ${file.name}. I will use it as reference for the next generation.`)]);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : isZh ? "文件上传失败。" : "File upload failed.");
    } finally {
      setUploadingReference(false);
    }
  }

  async function generateAll(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    setGenerationError("");
    setGenerationProgress("");
    setSaveStatus("");
    setSaveWarning("");
    setAuditOpen(false);
    if (!validateForm()) {
      setError(text.required);
      return;
    }
    if (!session?.access_token) {
      setError(text.signInRequired);
      return;
    }

    setLyrics("");
    setStylePrompt("");
    setCompositionPrompt("");
    setAudit(null);
    setGenerating(true);
    setGenerationProgress(isZh ? "正在生成歌曲…" : "Generating song...");
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          taskType: "song_workbench",
          projectTitle: form.title,
          genre: normalizedGenres(form).join(", "),
          input: buildSongGenerationInput(form, selectedSingers, selectedSourceProject),
          context: [
            songDevelopmentNotes.trim() ? `Music development chat notes:\n${songDevelopmentNotes}` : "",
            uploadedReference ? `Uploaded reference (${uploadedReference.type}, ${uploadedReference.mode}):\n${uploadedReference.text}` : "",
            selectedSourceProject ? `Source story project for OST/theme song:\n${summarizeSourceProject(selectedSourceProject)}` : "",
            universeBundle ? `Universe context for OST/theme song:\n${summarizeUniverseBundle(universeBundle)}` : "",
            lyrics.trim() ? `Existing lyrics to improve or replace:\n${lyrics}` : "",
            stylePrompt.trim() ? `Existing Suno style prompt:\n${stylePrompt}` : "",
          ].filter(Boolean).join("\n\n"),
          byoApi: buildSongByoApi(selectedModelProvider),
        }),
      });
      const payload = await readJsonResponse<{ success?: boolean; error?: string; output?: string }>(response);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "AI generation failed.");

      setGenerationProgress(isZh ? "正在解析结果…" : "Parsing result...");
      const parsed = parseSongGeneration(payload.output || "");
      const fallbackLyrics = buildLyrics(form, selectedSingers);
      const nextLyrics = sanitizeForbidden(parsed.lyrics || payload.output || fallbackLyrics, selectedSingers);
      const nextStylePrompt = trimPromptBytes(sanitizeForbidden(parsed.stylePrompt || buildMusicPrompt(form, selectedSingers), selectedSingers), MUSIC_PROMPT_MAX_BYTES);
      const nextCompositionPrompt = "";
      const nextAudit = auditLyrics(nextLyrics, nextStylePrompt, nextCompositionPrompt, selectedSingers, form);

      setLyrics(nextLyrics);
      setStylePrompt(nextStylePrompt);
      setCompositionPrompt(nextCompositionPrompt);
      setAudit(nextAudit);
      setLyricsDirty(false);
      void saveVersion("AI generation", "Generated lyrics and prompts through AI.", nextLyrics, nextStylePrompt, nextCompositionPrompt, nextAudit);
    } catch (generationError) {
      setGenerationError(generationError instanceof Error ? generationError.message : "AI generation failed.");
    } finally {
      setGenerating(false);
      setGenerationProgress("");
    }
  }

  async function saveVersion(
    changeType = "Manual save",
    summary = "Saved current workbench state.",
    nextLyrics = lyrics,
    nextStyle = stylePrompt,
    nextComposition = compositionPrompt,
    nextAudit = audit,
  ) {
    const version: SongVersion = {
      id: `song-version-${Date.now()}`,
      versionNumber: versions.length + 1,
      changeType,
      summary,
      auditStatus: nextAudit?.status || "pass",
      lyrics: nextLyrics,
      stylePrompt: nextStyle,
      compositionPrompt: nextComposition,
      createdAt: new Date().toISOString(),
    };
    setVersions((current) => [version, ...current]);
    await saveSongProjectToList({
      silent: true,
      lyrics: nextLyrics,
      stylePrompt: nextStyle,
      compositionPrompt: nextComposition,
      audit: nextAudit,
    });
  }

  async function saveSongProjectToList(options: SaveSongProjectOptions = {}) {
    const project = buildSongProjectSnapshot(
      songProjectId,
      form,
      options.lyrics ?? lyrics,
      options.stylePrompt ?? stylePrompt,
      options.compositionPrompt ?? compositionPrompt,
      options.audit ?? audit,
      songDevelopmentNotes,
      selectedSourceProject,
      selectedUniverseId || selectedSourceProject?.universeId || null,
    );
    setSavingProject(true);
    setError("");
    try {
      upsertProject(project);
      setSongProjectId(project.id);
      if (session?.access_token) {
        await upsertProjectToSupabase(project, { accessToken: session.access_token });
      }
      if (!options.silent) setSaveStatus(text.savedToProjects);
      setSaveWarning("");
    } catch (syncError) {
      const detail = syncError instanceof Error ? syncError.message : "";
      setSaveStatus(text.savedLocalOnly);
      setSaveWarning(detail ? `${text.cloudSyncFailed}: ${detail}` : text.cloudSyncFailed);
    } finally {
      setSavingProject(false);
    }
  }

  // 自动保存草稿（debounced 4s）：替代手动"保存到工作台"按钮，状态显示在顶部
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoSaveSkip = useRef(true);
  useEffect(() => {
    // 首次挂载 / 加载已有项目时跳过，避免覆盖刚读取的内容
    if (autoSaveSkip.current) {
      autoSaveSkip.current = false;
      return;
    }
    // 空草稿不自动保存，避免创建无意义空项目
    if (!form.title.trim() && !lyrics.trim() && !stylePrompt.trim()) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    setAutoSaveState("saving");
    autoSaveTimer.current = setTimeout(() => {
      void (async () => {
        try {
          await saveSongProjectToList({ silent: true });
          setAutoSaveState("saved");
          setAutoSaveTime(new Date().toLocaleTimeString());
        } catch {
          setAutoSaveState("failed");
        }
      })();
    }, 4000);
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lyrics, stylePrompt, compositionPrompt, form.title, form.concept, form.genres.join(",")]);

  // 交付工作包导出：客户端 JSZip 打包作品成果 / 创作留痕 / 来源与继承 / 权利证据 + manifest + checksums
  async function exportDeliveryPackage() {
    setExportingPackage(true);
    try {
      const title = form.title.trim() || (isZh ? "未命名歌曲" : "Untitled Song");
      const now = new Date();
      const stamp = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
      const zip = new JSZip();
      const entries: Array<{ path: string; bytes: Uint8Array }> = [];
      const encoder = new TextEncoder();
      const addText = (path: string, content: string) => {
        const bytes = encoder.encode(content);
        zip.file(path, bytes);
        entries.push({ path, bytes });
      };

      // 01-作品成果
      addText("01-作品成果/歌词.txt", lyrics || (isZh ? "（暂无歌词）" : "(no lyrics)"));
      addText("01-作品成果/翻译.txt", translatedLyrics || (isZh ? "（暂无翻译）" : "(no translation)"));
      addText("01-作品成果/曲风提示词.txt", stylePrompt || (isZh ? "（暂无曲风提示词）" : "(no style prompt)"));

      // 02-创作留痕
      addText("02-创作留痕/AI对话记录.txt", chatMessages.map((m) => `[${m.role === "user" ? (isZh ? "我" : "Me") : "Kiikis AI"} ${m.createdAt}]\n${m.content}`).join("\n\n---\n\n") || (isZh ? "（暂无对话记录）" : "(no chat)"));
      const timeline = versions.map((v) => `v${v.versionNumber} · ${v.changeType} · ${v.auditStatus} · ${new Date(v.createdAt).toISOString()}`).join("\n");
      addText("02-创作留痕/版本历史.txt", timeline || (isZh ? "（暂无版本）" : "(no versions)"));
      const report = [
        isZh ? "创作过程报告" : "Creation Process Report",
        `${isZh ? "标题" : "Title"}: ${title}`,
        `${isZh ? "生成时间" : "Generated at"}: ${now.toISOString()}`,
        `${isZh ? "歌词字数" : "Lyrics chars"}: ${lyrics.length}`,
        `${isZh ? "曲风提示词字节" : "Style prompt bytes"}: ${byteLength(stylePrompt)}`,
        `${isZh ? "审核状态" : "Audit status"}: ${audit?.status || (isZh ? "未审核" : "not reviewed")}`,
      ].join("\n");
      addText("02-创作留痕/创作过程报告.txt", report);

      // 03-来源与继承
      addText("03-来源与继承/Universe快照.txt", universeBundle ? `${universeBundle.universe.name}\n${summarizeUniverseBundle(universeBundle)}` : (isZh ? "未关联 Universe" : "No Universe linked"));
      addText("03-来源与继承/来源项目摘要.txt", selectedSourceProject ? summarizeSourceProject(selectedSourceProject) : (isZh ? "无来源项目" : "No source project"));
      const refList = uploadedReference
        ? `${uploadedReference.name} (${uploadedReference.type}, ${uploadedReference.mode})`
        : (isZh ? "无参考素材" : "No reference material");
      addText("03-来源与继承/参考素材清单.txt", refList);

      // 04-权利证据
      addText("04-权利证据/创作者声明.txt", [
        isZh ? "创作者声明" : "Creator Statement",
        `${isZh ? "作品标题" : "Work title"}: ${title}`,
        `${isZh ? "声明人" : "Declarant"}: ${session?.user?.email || (isZh ? "未登录用户" : "anonymous")}`,
        `${isZh ? "声明时间" : "Declared at"}: ${now.toISOString()}`,
        isZh ? "本声明记录创作过程与素材来源，不构成法律意义上的自动确权。" : "This statement records the creation process and material sources; it does not constitute automatic legal rights confirmation.",
      ].join("\n"));
      addText("04-权利证据/AI生成信息.txt", [
        isZh ? "AI 生成信息" : "AI Generation Info",
        `${isZh ? "输出模型" : "Output model"}: ${selectedModelProvider}`,
        `${isZh ? "生成次数" : "Generations"}: ${versions.length}`,
      ].join("\n"));
      addText("04-权利证据/素材授权信息.txt", [
        isZh ? "素材授权信息" : "Material License Info",
        `${isZh ? "作者" : "Author"}: ${materialAuthor || (isZh ? "未填写" : "not provided")}`,
        `${isZh ? "来源" : "Source"}: ${materialSource || (isZh ? "未填写" : "not provided")}`,
        `${isZh ? "授权类型" : "License"}: ${materialLicense || (isZh ? "未填写" : "not provided")}`,
        `${isZh ? "使用限制" : "Usage limits"}: ${materialUsage || (isZh ? "未填写" : "not provided")}`,
      ].join("\n"));
      const missing: string[] = [];
      if (!lyrics.trim()) missing.push(isZh ? "歌词为空" : "lyrics empty");
      if (!materialAuthor.trim()) missing.push(isZh ? "素材作者未填写" : "material author missing");
      if (!materialLicense.trim()) missing.push(isZh ? "授权类型未填写" : "license missing");
      if (!universeBundle) missing.push(isZh ? "未关联 Universe" : "no Universe linked");
      const complete = missing.length === 0;
      addText("04-权利证据/风险检查报告.txt", [
        isZh ? "风险检查报告" : "Risk Check Report",
        `${isZh ? "完整性" : "Completeness"}: ${complete ? (isZh ? "完整" : "complete") : (isZh ? "信息未完整" : "incomplete")}`,
        ...(missing.length ? [`${isZh ? "缺失项" : "Missing"}: ${missing.join("; ")}`] : []),
      ].join("\n"));
      addText("04-权利证据/缺失权利信息清单.txt", missing.length ? missing.join("\n") : (isZh ? "无缺失" : "none"));

      // manifest.json + checksums.sha256
      const sha256 = async (bytes: Uint8Array) => {
        const hash = await crypto.subtle.digest("SHA-256", bytes.buffer as ArrayBuffer);
        return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
      };
      const checksums: string[] = [];
      for (const entry of entries) {
        checksums.push(`${await sha256(entry.bytes)}  ${entry.path}`);
      }
      addText("checksums.sha256", checksums.join("\n"));
      const manifest = {
        schemaVersion: "kiikis.song-delivery/1",
        title,
        exportedAt: now.toISOString(),
        completeness: complete ? "complete" : "incomplete",
        fileCount: entries.length,
        exportedBy: session?.user?.email || "anonymous",
        universeId: selectedUniverseId || null,
        note: isZh ? "本工作包记录创作过程与来源，不构成法律意义上的自动确权。" : "This package records the creation process and sources; it does not constitute automatic legal rights confirmation.",
      };

      // §8.3 服务端条件允许时，对 manifest 增加服务端签名。
      // 密钥未配置时降级为"未签名"工作包（不阻塞导出）。
      let finalManifest: Record<string, unknown> = manifest;
      let signatureInfo: { signature: string; signedAt: string; signerKeyId: string } | null = null;
      try {
        const signResp = await fetch("/api/song/delivery-package/sign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            manifest,
            title,
            exportedAt: now.toISOString(),
            completeness: complete ? "complete" : "incomplete",
            fileCount: entries.length,
            universeId: selectedUniverseId || null,
          }),
        });
        if (signResp.ok) {
          const signData = await signResp.json() as {
            success: boolean;
            signature: string;
            signedAt: string;
            signerKeyId: string;
            signedManifest: Record<string, unknown>;
          };
          if (signData.success && signData.signature) {
            finalManifest = signData.signedManifest;
            signatureInfo = {
              signature: signData.signature,
              signedAt: signData.signedAt,
              signerKeyId: signData.signerKeyId,
            };
          }
        }
        // 503 SIGNING_NOT_CONFIGURED 或其他失败：静默降级，继续导出未签名工作包
      } catch {
        // 网络错误等：静默降级
      }

      addText("manifest.json", JSON.stringify(finalManifest, null, 2));
      if (signatureInfo) {
        addText("manifest.sig", [
          signatureInfo.signature,
          `algorithm: HMAC-SHA256`,
          `signedAt: ${signatureInfo.signedAt}`,
          `signerKeyId: ${signatureInfo.signerKeyId}`,
        ].join("\n"));
      }

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}_${stamp}_交付工作包.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : (isZh ? "导出失败" : "Export failed"));
    } finally {
      setExportingPackage(false);
    }
  }

  function importUniverseBackground() {
    if (!universeBundle) {
      setUniverseStatus(locale === "zh-CN" ? "请先选择可用的 Universe。" : "Select an available Universe first.");
      return;
    }

    const seed = buildUniverseSongSeed(universeBundle);
    setForm((current) => ({
      ...current,
      sourceProjectId: current.sourceProjectId,
      projectType: current.projectType === "original_song" ? "ost_theme" : current.projectType,
      title: current.title || `${universeBundle.universe.name} OST`,
      concept: [current.concept, seed].filter(Boolean).join("\n\n"),
      genres: current.genres.length ? current.genres : ["Cinematic Pop"],
      instruments: current.instruments.length ? current.instruments : ["piano", "strings", "cinematic percussion"],
    }));
    setUniverseStatus(locale === "zh-CN" ? "已导入 Universe 背景到歌曲创意。" : "Universe background imported into the song concept.");
  }

  // §7.2 路径二/三：建立或更新歌曲-Universe 关联（草稿状态）
  async function saveSongUniverseLink() {
    if (!songProjectId) {
      setUniverseStatus(isZh ? "请先保存歌曲项目。" : "Save the song project first.");
      return;
    }
    if (!selectedUniverseId) {
      setUniverseStatus(isZh ? "请先选择 Universe。" : "Select a Universe first.");
      return;
    }
    if (!session?.access_token) {
      setUniverseStatus(isZh ? "请先登录。" : "Sign in first.");
      return;
    }
    setSongUniverseBusy(true);
    setUniverseStatus("");
    try {
      const inheritanceScope = {
        characters: linkForm.inheritanceScope.characters ? ["*"] : [],
        locations: linkForm.inheritanceScope.locations ? ["*"] : [],
        canon_facts: linkForm.inheritanceScope.canonFacts ? ["*"] : [],
        timeline: linkForm.inheritanceScope.timeline,
        relationships: linkForm.inheritanceScope.relationships,
        style_guide: linkForm.inheritanceScope.styleGuide,
      };

      if (songUniverseLink) {
        // 已有关联：更新（仅 draft 状态可更新）
        if (songUniverseLink.status === "published") {
          setUniverseStatus(isZh ? "已发布的关联不能修改，请先取消发布。" : "Published link cannot be modified. Unpublish first.");
          return;
        }
        const updated = await updateSongUniverseLink(
          songUniverseLink.id,
          {
            song_role: linkForm.songRole,
            source_project_id: linkForm.sourceProjectId || null,
            inheritance_scope: inheritanceScope,
          },
          { accessToken: session.access_token },
        );
        setSongUniverseLink(updated);
        setUniverseStatus(isZh ? "关联已更新。" : "Link updated.");
      } else {
        // 无关联：新建（路径二/三）
        const created = await createSongUniverseLink(
          {
            universe_id: selectedUniverseId,
            song_project_id: songProjectId,
            song_role: linkForm.songRole,
            source_project_id: linkForm.sourceProjectId || null,
            inheritance_scope: inheritanceScope,
            notes: isZh ? "从歌曲工作台建立关联" : "Linked from song workbench",
          },
          { accessToken: session.access_token },
        );
        setSongUniverseLink(created);
        setUniverseStatus(isZh ? "已关联到 Universe（草稿）。" : "Linked to Universe (draft).");
      }
    } catch (linkError) {
      setUniverseStatus(linkError instanceof Error ? linkError.message : (isZh ? "关联失败。" : "Link failed."));
    } finally {
      setSongUniverseBusy(false);
    }
  }

  // §7.3 发布到 Universe：冻结当前正式版本
  async function publishSongToUniverseAction() {
    if (!songUniverseLink) return;
    if (!session?.access_token) {
      setUniverseStatus(isZh ? "请先登录。" : "Sign in first.");
      return;
    }
    if (songUniverseLink.status === "published") {
      setUniverseStatus(isZh ? "该关联已发布。" : "Already published.");
      return;
    }
    // 冻结版本：使用最新 version id，若无版本则用当前 songProjectId + 时间戳
    const frozenVersionId = versions[0]?.id || `${songProjectId}-snapshot-${Date.now()}`;
    setSongUniverseBusy(true);
    setUniverseStatus("");
    try {
      const canonSnapshot = universeBundle
        ? {
            universeName: universeBundle.universe.name,
            entityCount: universeBundle.entities.length,
            canonFactCount: universeBundle.canonFacts.length,
            snapshotAt: new Date().toISOString(),
          }
        : null;
      const published = await publishSongToUniverse(
        {
          linkId: songUniverseLink.id,
          frozenVersionId,
          canonSnapshot,
        },
        { accessToken: session.access_token },
      );
      setSongUniverseLink(published);
      setUniverseStatus(isZh ? "已发布到 Universe，正式版本已冻结。" : "Published to Universe. Official version frozen.");
    } catch (publishError) {
      setUniverseStatus(publishError instanceof Error ? publishError.message : (isZh ? "发布失败。" : "Publish failed."));
    } finally {
      setSongUniverseBusy(false);
    }
  }

  // §7.3 取消发布：把 published 改回 draft（解冻）
  async function unpublishSongFromUniverseAction() {
    if (!songUniverseLink || songUniverseLink.status !== "published") return;
    if (!session?.access_token) {
      setUniverseStatus(isZh ? "请先登录。" : "Sign in first.");
      return;
    }
    setSongUniverseBusy(true);
    setUniverseStatus("");
    try {
      const updated = await unpublishSongFromUniverse(songUniverseLink.id, { accessToken: session.access_token });
      setSongUniverseLink(updated);
      setUniverseStatus(isZh ? "已取消发布，恢复为草稿。" : "Unpublished, reverted to draft.");
    } catch (unpublishError) {
      setUniverseStatus(unpublishError instanceof Error ? unpublishError.message : (isZh ? "取消发布失败。" : "Unpublish failed."));
    } finally {
      setSongUniverseBusy(false);
    }
  }

  function buildSongCreativePackage(universeId = selectedUniverseId || selectedSourceProject?.universeId || null): CreativePackage {
    const now = new Date().toISOString();
    const title = form.title.trim() || (locale === "zh-CN" ? "未命名歌曲" : "Untitled Song");
    const sourceSummary = selectedSourceProject ? summarizeSourceProject(selectedSourceProject) : universeBundle ? summarizeUniverseBundle(universeBundle) : "";
    const characters = selectedSourceProject?.characterCards.slice(0, 12).map((card) => ({
      name: card.name || "Unnamed character",
      role: card.role,
      summary: [card.identity, card.goal, card.arc].filter(Boolean).join(" / "),
      projectVariant: {
        id: `song-character-${card.id || card.name || crypto.randomUUID()}`,
        title: `${title} musical theme`,
        source_workflow: "song",
        source_package_id: `song-package-${songProjectId || title}`,
        prompt: [form.primaryEmotion, stylePrompt].filter(Boolean).join("\n"),
      },
    })) || [];

    return {
      id: `song-package-${songProjectId || crypto.randomUUID()}`,
      workflowType: "song",
      title,
      summary: form.concept || lyrics.slice(0, 600) || sourceSummary.slice(0, 600),
      language: form.outputLanguage === "Custom" ? form.customLanguage || "Custom" : form.outputLanguage,
      universeId,
      sourceProjectId: songProjectId || selectedSourceProject?.id || null,
      sourceProjectTitle: selectedSourceProject?.title || null,
      characters,
      assets: [
        {
          id: `lyrics-${songProjectId || title}`,
          type: "document",
          title: `${title} lyrics`,
          prompt: lyrics,
          metadata: { auditStatus: audit?.status || "not_reviewed" },
        },
        {
          id: `style-${songProjectId || title}`,
          type: "prompt",
          title: `${title} style prompt`,
          prompt: stylePrompt,
          metadata: { genres: normalizedGenres(form), instruments: normalizedInstruments(form) },
        },
      ],
      canonFacts: [
        `Song asset for ${universeBundle?.universe.name || selectedSourceProject?.title || title}: ${title}`,
        `Song mood: ${form.primaryEmotion}`,
        normalizedGenres(form).length ? `Song genre: ${normalizedGenres(form).join(", ")}` : "",
      ].filter(Boolean),
      sourceText: [form.concept, sourceSummary, songDevelopmentNotes, lyrics, stylePrompt].filter(Boolean).join("\n\n"),
      metadata: {
        projectType: form.projectType,
        outputLanguage: form.outputLanguage,
        audit,
        sourceUniverseName: universeBundle?.universe.name || null,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  async function sendSongToUniverse() {
    if (!session?.access_token) {
      setUniverseStatus(locale === "zh-CN" ? "请先登录后再发送 Universe Inbox。" : "Please sign in before sending to Universe Inbox.");
      return;
    }
    const universeId = selectedUniverseId || selectedSourceProject?.universeId || "";
    if (!universeId) {
      setUniverseStatus(locale === "zh-CN" ? "请先选择或关联 Universe。" : "Select or link a Universe first.");
      return;
    }

    setUniverseBusy(true);
    setUniverseStatus(locale === "zh-CN" ? "正在发送歌曲包到 Universe Inbox..." : "Sending song package to Universe Inbox...");
    try {
      await saveSongProjectToList({ silent: true });
      const response = await fetch("/api/universe/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ universeId, creativePackage: buildSongCreativePackage(universeId) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || (locale === "zh-CN" ? "发送失败。" : "Failed to send."));
      await saveInboxItems(data.items || [], { accessToken: session.access_token });
      setUniverseStatus(locale === "zh-CN" ? `已发送 ${data.items?.length || 0} 条候选项到 Inbox。` : `Sent ${data.items?.length || 0} candidates to Inbox.`);
    } catch (universeError) {
      setUniverseStatus(universeError instanceof Error ? universeError.message : (locale === "zh-CN" ? "发送失败。" : "Failed to send."));
    } finally {
      setUniverseBusy(false);
    }
  }

  function runAudit() {
    const nextAudit = auditLyrics(lyrics, stylePrompt, compositionPrompt, selectedSingers, form);
    setError("");
    setAudit(nextAudit);
    setAuditOpen(true);
  }

  async function applyRevision() {
    const instruction = revisionInstruction.trim();
    if (!instruction || !lyrics.trim()) return;
    if (!session?.access_token) {
      setError(text.signInRequired);
      return;
    }

    setGenerating(true);
    setError("");
    try {
      const response = await fetch("/api/ai/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          taskType: "song_workbench",
          projectTitle: form.title || "Song revision",
          genre: normalizedGenres(form).join(", "),
          input: buildSongRevisionInput(form, instruction),
          context: [
            `Current lyrics:\n${lyrics}`,
            stylePrompt.trim() ? `Current style prompt:\n${stylePrompt}` : "",
            compositionPrompt.trim() ? `Current composition prompt:\n${compositionPrompt}` : "",
          ].filter(Boolean).join("\n\n"),
          byoApi: buildSongByoApi(selectedModelProvider),
        }),
      });
      const payload = await readJsonResponse<{ success?: boolean; error?: string; output?: string }>(response);
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "Revision failed.");

      const parsed = parseSongGeneration(payload.output || "");
      const nextLyrics = sanitizeForbidden(parsed.lyrics || payload.output || reviseLyrics(lyrics, instruction), selectedSingers);
      const nextStylePrompt = trimPromptBytes(sanitizeForbidden(parsed.stylePrompt || stylePrompt || buildStylePrompt(form, selectedSingers), selectedSingers), MUSIC_PROMPT_MAX_BYTES);
      const nextCompositionPrompt = trimPrompt(sanitizeForbidden(parsed.compositionPrompt || compositionPrompt || buildCompositionPrompt(form, selectedSingers), selectedSingers), 420);
      const nextAudit = auditLyrics(nextLyrics, nextStylePrompt, nextCompositionPrompt, selectedSingers, form);

      setLyrics(nextLyrics);
      setStylePrompt(nextStylePrompt);
      setCompositionPrompt(nextCompositionPrompt);
      setAudit(nextAudit);
      setRevisionInstruction("");
      await saveVersion("Revision", instruction, nextLyrics, nextStylePrompt, nextCompositionPrompt, nextAudit);
    } catch (revisionError) {
      setError(revisionError instanceof Error ? revisionError.message : "Revision failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyText(value: string, guarded = false) {
    if (guarded && !canCopyLyrics) {
      setError("High-risk lyrics must be revised before copying.");
      return;
    }
    await navigator.clipboard.writeText(value);
  }

  function previewVersion(version: SongVersion) {
    setLyrics(version.lyrics);
    setStylePrompt(trimPromptBytes(version.stylePrompt, MUSIC_PROMPT_MAX_BYTES));
    setCompositionPrompt(version.compositionPrompt);
    setLyricsDirty(false);
    setAudit(auditLyrics(version.lyrics, version.stylePrompt, version.compositionPrompt, selectedSingers, form));
  }

  function openSingerEditor(singer?: SingerProfile) {
    setSingerDraft(singer ? cloneSinger(singer) : { ...emptySingerDraft, id: `manual-${Date.now()}` });
  }

  function updateSingerDraft<K extends keyof SingerProfile>(key: K, value: SingerProfile[K]) {
    setSingerDraft((current) => current ? { ...current, [key]: value } : current);
  }

  function saveSingerDraft() {
    if (!singerDraft) return;
    const normalized = normalizeSingerDraft(singerDraft);
    if (!normalized.displayName) return;
    setSingers((current) => {
      const exists = current.some((singer) => singer.id === normalized.id);
      return exists ? current.map((singer) => (singer.id === normalized.id ? normalized : singer)) : [...current, normalized];
    });
    setForm((current) => ({
      ...current,
      selectedSingerIds: current.selectedSingerIds.includes(normalized.id) ? current.selectedSingerIds : [...current.selectedSingerIds, normalized.id],
    }));
    setSingerDraft(null);
  }

  function deleteSingerDraft() {
    if (!singerDraft) return;
    setSingers((current) => current.filter((singer) => singer.id !== singerDraft.id));
    setForm((current) => ({ ...current, selectedSingerIds: current.selectedSingerIds.filter((id) => id !== singerDraft.id) }));
    setSingerDraft(null);
  }

  // 拖动分隔线：根据鼠标位置更新右侧上方占比（20%~85%）
  function onSplitterMouseDown(event: React.MouseEvent<HTMLDivElement>) {
    event.preventDefault();
    splitterDragging.current = true;
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onSplitterMouseMove);
    window.addEventListener("mouseup", onSplitterMouseUp);
  }
  function onSplitterMouseMove(event: MouseEvent) {
    if (!splitterDragging.current || !rightContainerRef.current) return;
    const rect = rightContainerRef.current.getBoundingClientRect();
    if (rect.height <= 0) return;
    const offset = event.clientY - rect.top;
    let pct = (offset / rect.height) * 100;
    pct = Math.max(20, Math.min(85, pct));
    setUpperHeightPct(pct);
  }
  function onSplitterMouseUp() {
    splitterDragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("mousemove", onSplitterMouseMove);
    window.removeEventListener("mouseup", onSplitterMouseUp);
  }

  return (
    <main className="cosmic-page song-workbench-page song-workbench-v2">
      <section className="cosmic-title-band song-title-bar">
        {/* 歌曲标题：左上角，可直接点击编辑 */}
        <div className="song-title-wrap">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="song-title-input"
              value={form.title}
              onChange={(event) => updateForm("title", event.target.value)}
              onBlur={() => setEditingTitle(false)}
              onKeyDown={(event) => { if (event.key === "Enter" || event.key === "Escape") setEditingTitle(false); }}
              placeholder={isZh ? "歌曲标题" : "Song title"}
              autoFocus
            />
          ) : (
            <h1
              className="song-title-editable"
              onClick={() => { setEditingTitle(true); setTimeout(() => titleInputRef.current?.focus(), 0); }}
              title={isZh ? "点击编辑标题" : "Click to edit title"}
            >
              {form.title.trim() || (isZh ? "未命名歌曲" : "Untitled Song")}
            </h1>
          )}
        </div>
        <div className="song-toolbar">
          {/* 移动端视图切换（仅手机/平板竖屏显示，桌面端隐藏） */}
          <button
            className="secondary-button song-tool-btn song-mobile-toggle"
            type="button"
            onClick={() => setMobileView(mobileView === "chat" ? "results" : "chat")}
          >
            {mobileView === "chat" ? (isZh ? "结果" : "Results") : (isZh ? "对话" : "Chat")}
          </button>
          <button className="secondary-button song-tool-btn" type="button" onClick={() => setDrawerType("universe")}>
            <Globe size={15} />
            {isZh ? `Universe${universeBundle ? " · 已关联" : ""}` : `Universe${universeBundle ? " · linked" : ""}`}
          </button>
          {/* 自动保存状态：纯文字状态，非按钮。失败时提供重试链接 */}
          <span className="song-autosave-status" data-state={autoSaveState}>
            {autoSaveState === "saving" ? (
              <><Loader2 className="spin" size={13} />{isZh ? "保存中" : "Saving"}</>
            ) : autoSaveState === "saved" ? (
              <>{isZh ? `已保存${autoSaveTime ? ` ${autoSaveTime}` : ""}` : `Saved${autoSaveTime ? ` ${autoSaveTime}` : ""}`}</>
            ) : autoSaveState === "failed" ? (
              <>{isZh ? "保存失败" : "Save failed"} <button type="button" className="song-autosave-retry" onClick={() => { void saveSongProjectToList({ silent: true }).then(() => { setAutoSaveState("saved"); setAutoSaveTime(new Date().toLocaleTimeString()); }).catch(() => setAutoSaveState("failed")); }}>{isZh ? "重试" : "Retry"}</button></>
            ) : null}
          </span>
          <button className="secondary-button song-tool-btn" type="button" onClick={() => void exportDeliveryPackage()} disabled={exportingPackage}>
            <Package size={15} />
            {exportingPackage ? (isZh ? "打包" : "Pack") : (isZh ? "交付工作包" : "Deliver")}
          </button>
          <button className="secondary-button song-tool-btn" type="button" onClick={() => setDrawerType("more")}>
            <MoreHorizontal size={15} />
            {isZh ? "更多" : "More"}
          </button>
          {/* Suno：纯超链接，不复制不填充 */}
          <a className="secondary-button song-tool-btn song-suno-link" href="https://suno.com" target="_blank" rel="noopener noreferrer">
            Suno <ExternalLink size={14} />
          </a>
        </div>
      </section>

      {error ? <div className="notice error song-shell-notice">{error}</div> : null}
      {saveWarning ? <div className="notice warning song-shell-notice">{saveWarning}</div> : null}

      <section className="song-workbench-shell song-shell-v2" style={{ "--upper-pct": upperHeightPct } as React.CSSProperties}>
        {/* 左侧 38%：AI 创作对话（只负责对话，不触发作品生成） */}
        <form
          className={`dashboard-panel song-chat-panel ${mobileView === "chat" ? "song-mobile-active" : "song-mobile-hidden"}`}
          onSubmit={(event) => { event.preventDefault(); void sendChatMessage(); }}
        >
          <div className="dashboard-panel-head">
            <div>
              <span>{isZh ? "AI 创作对话" : "AI Creation Chat"}</span>
            </div>
          </div>

          <div className="song-chat-thread" aria-live="polite">
            {chatMessages.map((message) => (
              <article className={`song-chat-message ${message.role}`} key={message.id}>
                <span>{message.role === "user" ? (isZh ? "我" : "Me") : "Kiikis AI"}</span>
                <p>{message.content}</p>
              </article>
            ))}
          </div>

          <div className="song-chat-composer">
            <textarea
              className="song-concept-textarea"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  event.preventDefault();
                  void sendChatMessage();
                }
              }}
              placeholder={isZh ? "像聊天一样描述：用途、情绪、画面、歌词语言、参考感觉、想修改的地方。⌘/Ctrl + Enter 发送。" : "Describe the use, emotion, scene, lyric language, reference feeling, or revision notes. Cmd/Ctrl + Enter to send."}
            />
            <div className="song-chat-actions">
              <button className="primary-button" type="submit" disabled={!chatInput.trim() || chatGenerating}>
                <Send size={15} />
                {chatGenerating ? (isZh ? "反馈中" : "Replying") : (isZh ? "发送想法" : "Send idea")}
              </button>
              <button
                className="primary-button song-generate-from-chat-btn"
                type="button"
                onClick={() => void generateSongFromChat()}
                disabled={generating || chatGenerating}
              >
                <Sparkles size={15} />
                {generating ? text.generating : (isZh ? "生成/更新歌曲" : "Generate / Update song")}
              </button>
            </div>
          </div>
        </form>

        {/* 右侧 62%：创作结果（上下分割，可拖动） */}
        <section className={`song-workbench-right ${mobileView === "results" ? "song-mobile-active" : "song-mobile-hidden"}`} ref={rightContainerRef}>
          {/* 生成进度状态（明确进度，禁用重复提交） */}
          {generationProgress ? (
            <div className="song-right-status song-right-progress" role="status" aria-live="polite">
              <Loader2 className="spin" size={14} />
              <span>{generationProgress}</span>
            </div>
          ) : null}
          {/* 生成失败错误（在右侧创作区显示，不伪造成功结果） */}
          {generationError ? (
            <div className="song-right-status song-right-error" role="alert">
              <span>{generationError}</span>
            </div>
          ) : null}
          <div className="song-right-upper">
            {/* 移动端歌词/翻译标签页 */}
            <div className="song-mobile-tabs" role="tablist">
              <button className={mobileTab === "lyrics" ? "active" : ""} role="tab" aria-selected={mobileTab === "lyrics"} onClick={() => setMobileTab("lyrics")}>
                {text.lyrics}
              </button>
              <button className={mobileTab === "translation" ? "active" : ""} role="tab" aria-selected={mobileTab === "translation"} onClick={() => setMobileTab("translation")}>
                {isZh ? "翻译" : "Translation"}
              </button>
            </div>

            <div className="song-upper-grid">
              {/* 歌词（可编辑） */}
              <div className={`dashboard-panel song-output-card song-lyrics-card ${mobileTab === "lyrics" ? "" : "mobile-hidden"}`}>
                <div className="song-output-card-head">
                  <span className="song-card-title">
                    {text.lyrics}
                    {lyricsDirty ? <small className="song-dirty-badge">{isZh ? "待更新" : "Unsaved"}</small> : null}
                  </span>
                  <div className="song-card-actions">
                    <button className="icon-button" type="button" title={text.copy} disabled={!lyrics || !canCopyLyrics} onClick={() => copyText(lyrics, true)}>
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
                <textarea
                  className="song-lyrics-textarea"
                  value={lyrics}
                  onChange={(event) => { setLyrics(event.target.value); setLyricsDirty(true); }}
                  placeholder="[Intro - 3 seconds]..."
                />
              </div>

              {/* 翻译（只读） */}
              <div className={`dashboard-panel song-output-card song-translation-card ${mobileTab === "translation" ? "" : "mobile-hidden"}`}>
                <div className="song-output-card-head">
                  <span className="song-card-title">
                    {isZh ? "翻译" : "Translation"}
                    <small className="song-readonly-badge">{isZh ? "只读" : "Read-only"}</small>
                  </span>
                  <div className="song-card-actions">
                    <select value={translationLanguage} onChange={(event) => setTranslationLanguage(event.target.value as LyricsTranslationLanguage)}>
                      {translationLanguages.map((language) => <option key={language}>{language}</option>)}
                    </select>
                    <button type="button" className="icon-button" title={isZh ? "翻译歌词" : "Translate lyrics"} disabled={translationGenerating || !lyrics.trim()} onClick={() => void handleManualTranslate()}>
                      {translationGenerating ? <Loader2 className="spin" size={15} /> : <Languages size={15} />}
                    </button>
                    <button className="icon-button" type="button" title={text.copy} disabled={!translatedLyrics} onClick={() => copyText(translatedLyrics)}>
                      <Copy size={15} />
                    </button>
                  </div>
                </div>
                {translationGenerating ? <small className="field-note">{isZh ? "正在翻译歌词…" : "Translating lyrics..."}</small> : null}
                {translationError ? <small className="field-note song-save-warning">{translationError}</small> : null}
                <textarea
                  className="song-lyrics-textarea"
                  value={translatedLyrics}
                  readOnly
                  placeholder={isZh ? "点击翻译按钮或自动翻译；中文歌词不翻译。" : "Click translate button or auto-translate; Chinese lyrics are not translated."}
                />
              </div>
            </div>
          </div>

          {/* 可拖动水平分隔线 */}
          <div className="song-splitter" onMouseDown={onSplitterMouseDown} role="separator" aria-orientation="horizontal">
            <div className="song-splitter-handle" />
          </div>

          {/* 下方：曲风提示词 */}
          <div className="song-right-lower">
            <div className="dashboard-panel song-output-card song-style-card">
              <div className="song-output-card-head">
                <span className="song-card-title">
                  {isZh ? "曲风提示词" : "Style Prompt"}
                </span>
                <div className="song-card-actions">
                  <small className={musicPromptBytes > MUSIC_PROMPT_MAX_BYTES ? "field-note song-save-warning" : "field-note song-byte-count"}>
                    {musicPromptBytes}/{MUSIC_PROMPT_MAX_BYTES} bytes
                  </small>
                  <button className="icon-button" type="button" title={text.copy} disabled={!stylePrompt} onClick={() => copyText(stylePrompt)}>
                    <Copy size={15} />
                  </button>
                </div>
              </div>
              <textarea
                className="song-prompt-textarea"
                value={stylePrompt}
                onChange={(event) => setStylePrompt(trimPromptBytes(event.target.value, MUSIC_PROMPT_MAX_BYTES))}
                placeholder={isZh ? "生成后会得到一段精炼的 Suno style 提示词。" : "A concise Suno style prompt appears here after generation."}
              />
            </div>
          </div>
          <div className="song-audio-dock">
            <AudioCandidates candidates={audioCandidates} busy={audioGenerating} isZh={isZh} onGenerate={() => void generateSongAudio()} />
          </div>
        </section>
      </section>

      {/* 抽屉：低频功能（更多 / 素材与版权 / Universe / 版本） */}
      {drawerType ? (
        <div className="song-drawer-backdrop" onClick={() => setDrawerType(null)}>
          <div className="song-drawer" onClick={(event) => event.stopPropagation()}>
            <header className="song-drawer-head">
              <h2>
                {drawerType === "more" ? (isZh ? "更多" : "More")
                  : "Universe"}
              </h2>
              <button className="icon-button" type="button" onClick={() => setDrawerType(null)} aria-label={isZh ? "关闭" : "Close"}>
                <X size={18} />
              </button>
            </header>
            <div className="song-drawer-body">
              {drawerType === "more" ? (
                <div className="song-more-stack">
                  {/* 创作留痕 */}
                  <div className="song-more-section">
                    <h3 className="song-step-title">{isZh ? "创作留痕" : "Creation trace"}</h3>
                    <p className="subtle">{isZh ? "系统持续记录你在 Kiikis 上的创作过程。需要时可一键下载，证明这首歌是你在什么时间在 kiikis.com 上创作的。" : "Kiikis records your creation process. Download anytime as proof of when and where you created this song."}</p>
                    <div className="song-trace-timeline">
                      {chatMessages.length === 0 && versions.length === 0 ? (
                        <p className="subtle">{isZh ? "暂无创作记录。开始对话或生成后，这里会记录每一步。" : "No activity yet."}</p>
                      ) : (
                        <>
                          {chatMessages.slice(-8).map((msg) => (
                            <div key={msg.id} className="song-trace-item">
                              <span className="song-trace-time">{new Date(msg.createdAt).toLocaleString()}</span>
                              <span className={`song-trace-tag song-trace-tag-${msg.role}`}>{msg.role === "user" ? (isZh ? "我的想法" : "My idea") : "AI"}</span>
                              <p className="song-trace-content">{msg.content.slice(0, 100)}{msg.content.length > 100 ? "…" : ""}</p>
                            </div>
                          ))}
                          {versions.slice(0, 5).map((v) => (
                            <div key={v.id} className="song-trace-item">
                              <span className="song-trace-time">{new Date(v.createdAt).toLocaleString()}</span>
                              <span className="song-trace-tag song-trace-tag-version">{isZh ? `版本 ${v.versionNumber}` : `v${v.versionNumber}`}</span>
                              <p className="song-trace-content">{v.summary || v.changeType}</p>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                    <button className="primary-button" type="button" onClick={() => void exportDeliveryPackage()} disabled={exportingPackage || (chatMessages.length === 0 && versions.length === 0)}>
                      <Package size={15} />
                      {exportingPackage ? (isZh ? "打包中" : "Packing") : (isZh ? "一键下载留痕" : "Download trace")}
                    </button>
                  </div>

                  {/* 版本历史 */}
                  <div className="song-more-section">
                    <div className="song-tool-head">
                      <h3 className="song-step-title">{isZh ? "版本历史" : "Version history"}</h3>
                      <button className="secondary-button" type="button" onClick={() => void saveVersion()}>{text.saveVersion}</button>
                    </div>
                    {versions.length === 0 ? (
                      <p className="subtle">{text.noVersions}</p>
                    ) : (
                      <div className="settings-list song-history-list">
                        {versions.map((version) => (
                          <button className="settings-card song-version-card" type="button" key={version.id} onClick={() => previewVersion(version)}>
                            <span>v{version.versionNumber} / {version.auditStatus}</span>
                            <h3>{version.changeType}</h3>
                            <p>{version.summary}</p>
                            <p>{new Date(version.createdAt).toLocaleString()}</p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 输出模型 */}
                  <div className="song-more-section">
                    <h3 className="song-step-title">{isZh ? "输出模型" : "Output model"}</h3>
                    <label>
                      <select value={selectedModelProvider} onChange={(event) => setSelectedModelProvider(event.target.value as SongModelProvider)}>
                        <option value="auto">{isZh ? "自动路由" : "Auto route"}</option>
                        <option value="deepseek">DeepSeek</option>
                      </select>
                    </label>
                    {selectedSourceProject ? (
                      <div className="song-source-panel">
                        <span>{isZh ? "OST 来源" : "OST source"}</span>
                        <strong>{selectedSourceProject.title}</strong>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}

              {drawerType === "universe" ? (
                <div className="song-source-panel">
                  <span>Universe</span>
                  <strong>{universeBundle?.universe.name || (isZh ? "未选择 Universe" : "No Universe selected")}</strong>

                  {/* §7 关联状态显示 */}
                  {songUniverseLink ? (
                    <div className="song-universe-status-badge" data-status={songUniverseLink.status}>
                      {songUniverseLink.status === "published" && (
                        <span className="song-status-tag song-status-published">
                          {isZh ? "已发布" : "Published"}
                        </span>
                      )}
                      {songUniverseLink.status === "draft" && (
                        <span className="song-status-tag song-status-draft">
                          {isZh ? "草稿关联" : "Draft link"}
                        </span>
                      )}
                      {songUniverseLink.status === "deprecated" && (
                        <span className="song-status-tag song-status-deprecated">
                          {isZh ? "已废弃" : "Deprecated"}
                        </span>
                      )}
                      <small>
                        {isZh ? "歌曲角色" : "Role"}: {songRoleLabel(songUniverseLink.song_role, isZh)}
                      </small>
                      {songUniverseLink.frozen_version_id && (
                        <small>
                          {isZh ? "冻结版本" : "Frozen"}: {songUniverseLink.frozen_version_id.slice(0, 12)}
                        </small>
                      )}
                    </div>
                  ) : (
                    <div className="song-universe-status-badge" data-status="unlinked">
                      <span className="song-status-tag song-status-unlinked">
                        {isZh ? "未关联 Universe" : "No Universe linked"}
                      </span>
                      <small>{isZh ? "Universe 是歌曲归属与继承的唯一入口" : "Universe is the single source for song ownership"}</small>
                    </div>
                  )}

                  {/* §7.2 步骤 1：选择目标 Universe */}
                  <h3 className="song-step-title">{isZh ? "1. 选择目标 Universe" : "1. Select Universe"}</h3>
                  {universes.length ? (
                    <label>
                      {isZh ? "目标 Universe" : "Target Universe"}
                      <select value={selectedUniverseId} onChange={(event) => setSelectedUniverseId(event.target.value)}>
                        <option value="">{isZh ? "不关联 Universe" : "No Universe"}</option>
                        {universes.map((universe) => (
                          <option key={universe.id} value={universe.id}>{universe.name}</option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <p className="subtle">{isZh ? "暂无可用 Universe。可先从剧本或分镜创建。" : "No Universe yet. Create one from script or storyboard first."}</p>
                  )}

                  {/* §7.2 步骤 2：选择歌曲角色 */}
                  <h3 className="song-step-title">{isZh ? "2. 选择歌曲角色" : "2. Song Role"}</h3>
                  <label>
                    {isZh ? "歌曲角色" : "Song Role"}
                    <select
                      value={linkForm.songRole}
                      onChange={(event) => setLinkForm((current) => ({ ...current, songRole: event.target.value as SongUniverseRole }))}
                      disabled={songUniverseLink?.status === "published"}
                    >
                      <option value="theme_song">{isZh ? "主题曲" : "Theme song"}</option>
                      <option value="ending_song">{isZh ? "片尾曲" : "Ending song"}</option>
                      <option value="character_song">{isZh ? "角色歌" : "Character song"}</option>
                      <option value="insert_song">{isZh ? "插曲" : "Insert song"}</option>
                      <option value="bgm">BGM</option>
                      <option value="promo_song">{isZh ? "宣传曲" : "Promo song"}</option>
                    </select>
                  </label>

                  {/* §7.2 步骤 3：选择来源项目 */}
                  <h3 className="song-step-title">{isZh ? "3. 来源项目（可选）" : "3. Source Project (optional)"}</h3>
                  <label>
                    {isZh ? "来源项目" : "Source Project"}
                    <select
                      value={linkForm.sourceProjectId}
                      onChange={(event) => setLinkForm((current) => ({ ...current, sourceProjectId: event.target.value }))}
                      disabled={songUniverseLink?.status === "published"}
                    >
                      <option value="">{isZh ? "无来源项目" : "No source project"}</option>
                      {sourceProjects.map((project) => (
                        <option key={project.id} value={project.id}>{project.title}</option>
                      ))}
                    </select>
                  </label>

                  {/* §7.2 步骤 4：选择继承范围 */}
                  <h3 className="song-step-title">{isZh ? "4. 继承范围" : "4. Inheritance Scope"}</h3>
                  <div className="song-inheritance-grid">
                    <label className="song-checkbox-row">
                      <input
                        type="checkbox"
                        checked={linkForm.inheritanceScope.characters}
                        onChange={(event) => setLinkForm((current) => ({ ...current, inheritanceScope: { ...current.inheritanceScope, characters: event.target.checked } }))}
                        disabled={songUniverseLink?.status === "published"}
                      />
                      <span>{isZh ? "角色" : "Characters"}</span>
                    </label>
                    <label className="song-checkbox-row">
                      <input
                        type="checkbox"
                        checked={linkForm.inheritanceScope.locations}
                        onChange={(event) => setLinkForm((current) => ({ ...current, inheritanceScope: { ...current.inheritanceScope, locations: event.target.checked } }))}
                        disabled={songUniverseLink?.status === "published"}
                      />
                      <span>{isZh ? "地点" : "Locations"}</span>
                    </label>
                    <label className="song-checkbox-row">
                      <input
                        type="checkbox"
                        checked={linkForm.inheritanceScope.canonFacts}
                        onChange={(event) => setLinkForm((current) => ({ ...current, inheritanceScope: { ...current.inheritanceScope, canonFacts: event.target.checked } }))}
                        disabled={songUniverseLink?.status === "published"}
                      />
                      <span>{isZh ? "Canon 事实" : "Canon facts"}</span>
                    </label>
                    <label className="song-checkbox-row">
                      <input
                        type="checkbox"
                        checked={linkForm.inheritanceScope.timeline}
                        onChange={(event) => setLinkForm((current) => ({ ...current, inheritanceScope: { ...current.inheritanceScope, timeline: event.target.checked } }))}
                        disabled={songUniverseLink?.status === "published"}
                      />
                      <span>{isZh ? "时间线" : "Timeline"}</span>
                    </label>
                    <label className="song-checkbox-row">
                      <input
                        type="checkbox"
                        checked={linkForm.inheritanceScope.relationships}
                        onChange={(event) => setLinkForm((current) => ({ ...current, inheritanceScope: { ...current.inheritanceScope, relationships: event.target.checked } }))}
                        disabled={songUniverseLink?.status === "published"}
                      />
                      <span>{isZh ? "关系" : "Relationships"}</span>
                    </label>
                    <label className="song-checkbox-row">
                      <input
                        type="checkbox"
                        checked={linkForm.inheritanceScope.styleGuide}
                        onChange={(event) => setLinkForm((current) => ({ ...current, inheritanceScope: { ...current.inheritanceScope, styleGuide: event.target.checked } }))}
                        disabled={songUniverseLink?.status === "published"}
                      />
                      <span>{isZh ? "风格指南" : "Style guide"}</span>
                    </label>
                  </div>

                  {/* §7.2 步骤 5：确认关联 / §7.3 发布 */}
                  <h3 className="song-step-title">{isZh ? "5. 确认关联与发布" : "5. Confirm & Publish"}</h3>
                  <div className="simple-action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void saveSongUniverseLink()}
                      disabled={songUniverseBusy || !session || !selectedUniverseId || !songProjectId || songUniverseLink?.status === "published"}
                    >
                      {songUniverseLink ? (isZh ? "更新关联" : "Update link") : (isZh ? "关联到 Universe" : "Link to Universe")}
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={importUniverseBackground}
                      disabled={!universeBundle}
                    >
                      {isZh ? "导入背景" : "Import background"}
                    </button>
                  </div>

                  {/* §7.3 发布/取消发布 */}
                  <div className="simple-action-row">
                    {(!songUniverseLink || songUniverseLink.status === "draft") && (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => void publishSongToUniverseAction()}
                        disabled={songUniverseBusy || !songUniverseLink}
                        title={isZh ? "冻结当前正式版本，发布到 Universe" : "Freeze current version and publish to Universe"}
                      >
                        {isZh ? "发布到 Universe" : "Publish to Universe"}
                      </button>
                    )}
                    {songUniverseLink?.status === "published" && (
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void unpublishSongFromUniverseAction()}
                        disabled={songUniverseBusy}
                      >
                        {isZh ? "取消发布" : "Unpublish"}
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => void sendSongToUniverse()}
                      disabled={universeBusy || !session || !selectedUniverseId}
                      title={isZh ? "提议修改 Canon 或提交审核" : "Propose canon changes or submit for review"}
                    >
                      <Send size={15} />
                      {isZh ? "发送 Inbox" : "Send Inbox"}
                    </button>
                  </div>

                  {/* §7.3 切换 Universe 警告 */}
                  {songUniverseLink && songUniverseLink.status === "published" && (
                    <p className="field-note song-save-warning">
                      {isZh ? "已发布版本不可直接修改。如需切换 Universe 或修改关联，请先取消发布。" : "Published version is locked. Unpublish before switching Universe or editing."}
                    </p>
                  )}

                  {universeStatus ? <small className="field-note">{universeStatus}</small> : null}

                  {/* Canon 快照信息（已发布时显示） */}
                  {songUniverseLink?.canon_snapshot && (
                    <details className="song-canon-snapshot">
                      <summary>{isZh ? "Canon 快照" : "Canon snapshot"}</summary>
                      <pre>{JSON.stringify(songUniverseLink.canon_snapshot, null, 2)}</pre>
                    </details>
                  )}
                </div>
              ) : null}

            </div>
          </div>
        </div>
      ) : null}
      {auditOpen ? (
        <div className="modal-backdrop">
          <div className="modal song-audit-modal">
            <h2>{text.audit}</h2>
            <p>{audit ? auditReportText(audit) : text.auditPass}</p>
            <div className="modal-actions">
              <button className="primary-button" type="button" onClick={() => setAuditOpen(false)}>{text.close}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function buildSongGenerationInput(form: SongForm, singers: SingerProfile[], sourceProject: DramaProject | null) {
  const projectType = projectTypes.find((item) => item.value === form.projectType);
  const language = form.outputLanguage === "Custom" ? form.customLanguage || "Custom" : form.outputLanguage;

  return JSON.stringify(
    {
      title: form.title,
      projectType: projectType ? `${projectType.label} / ${projectType.labelEn}` : form.projectType,
      strategy: projectType?.strategy || "",
      outputLanguage: language,
      lyricsMode: form.lyricsMode,
      concept: form.concept,
      primaryEmotion: form.primaryEmotion,
      secondaryEmotions: form.secondaryEmotions,
      genres: normalizedGenres(form),
      vocalDirection: singers.length
        ? singers.map((singer) => ({
            displayName: singer.displayName,
            safePromptTerms: singer.safePromptTerms,
            forbiddenOutputTerms: singer.forbiddenOutputTerms,
            voiceTexture: singer.voiceTexture,
            delivery: singer.delivery,
          }))
        : "not specified",
      groove: specifiedValue(form.groove) || "not specified",
      key: specifiedValue(form.key) || "not specified",
      instruments: normalizedInstruments(form),
      structure: specifiedValue(form.structure) || "not specified",
      sourceProject: sourceProject ? {
        id: sourceProject.id,
        title: sourceProject.title,
        workflowType: sourceProject.workflowType,
        genre: sourceProject.genre,
        universeId: sourceProject.universeId || null,
        summary: summarizeSourceProject(sourceProject),
      } : "not specified",
    },
    null,
    2,
  );
}

function buildSongRevisionInput(form: SongForm, instruction: string) {
  return JSON.stringify(
    {
      mode: "revise_existing_song",
      revisionInstruction: instruction,
      requiredBehavior: "Rewrite the lyrics and prompts according to the revision instruction. Return the complete revised song, not a change note.",
      title: form.title,
      outputLanguage: form.outputLanguage === "Custom" ? form.customLanguage || "Custom" : form.outputLanguage,
      lyricsMode: form.lyricsMode,
      concept: form.concept,
      primaryEmotion: form.primaryEmotion,
      genres: normalizedGenres(form),
      instruments: normalizedInstruments(form),
      groove: specifiedValue(form.groove) || "not specified",
      key: specifiedValue(form.key) || "not specified",
      structure: specifiedValue(form.structure) || "not specified",
    },
    null,
    2,
  );
}

function buildSongProjectSnapshot(
  existingId: string | null,
  form: SongForm,
  lyrics: string,
  stylePrompt: string,
  compositionPrompt: string,
  audit: AuditResult | null,
  developmentNotes: string,
  sourceProject: DramaProject | null,
  universeIdOverride: string | null = null,
): DramaProject {
  const now = new Date().toISOString();
  const title = form.title.trim() || "未命名歌曲";
  const genres = normalizedGenres(form);
  const content = buildSongProjectMarkdown(form, lyrics, stylePrompt, developmentNotes, audit, sourceProject);

  return createProject({
    id: existingId || `song-${crypto.randomUUID()}`,
    workflowType: "song",
    title,
    market: "",
    genre: genres.join(", ") || "音乐",
    targetLanguage: form.outputLanguage === "Custom" ? form.customLanguage || "Custom" : form.outputLanguage,
    episodeCount: 1,
    episodeDuration: "",
    idea: form.concept,
    brief: content,
    finalScript: lyrics,
    deliveryPackage: content,
    universeId: universeIdOverride || sourceProject?.universeId || null,
    projectRole: universeIdOverride || sourceProject?.universeId ? "other" : null,
    inheritanceSettings: sourceProject || universeIdOverride ? {
      sourceProjectId: sourceProject?.id || null,
      sourceProjectTitle: sourceProject?.title || null,
      purpose: "ost_theme_song",
      inheritUniverse: Boolean(universeIdOverride || sourceProject?.universeId),
    } : null,
    status: lyrics.trim() || stylePrompt.trim() ? "ready" : "draft",
    updatedAt: now,
  });
}

function buildSongProjectMarkdown(
  form: SongForm,
  lyrics: string,
  stylePrompt: string,
  developmentNotes: string,
  audit: AuditResult | null,
  sourceProject: DramaProject | null,
) {
  const projectType = projectTypes.find((item) => item.value === form.projectType);
  return [
    `# ${form.title.trim() || "未命名歌曲"}`,
    "",
    "## 创作设定",
    `- 项目类型：${projectType ? `${projectType.label} / ${projectType.labelEn}` : form.projectType}`,
    `- 输出语言：${form.outputLanguage === "Custom" ? form.customLanguage || "Custom" : form.outputLanguage}`,
    `- 曲风：${normalizedGenres(form).join(", ") || "Not specified"}`,
    `- 情绪：${form.primaryEmotion}`,
    `- 乐器：${normalizedInstruments(form).join(", ") || "Not specified"}`,
    `- 律动：${specifiedValue(form.groove) || "Not specified"}`,
    `- 调性：${specifiedValue(form.key) || "Not specified"}`,
    `- 结构：${specifiedValue(form.structure) || "Not specified"}`,
    sourceProject ? `- 来源项目：${sourceProject.title || sourceProject.id}` : "",
    sourceProject?.universeId ? `- 关联 Universe：${sourceProject.universeId}` : "",
    "",
    "## 歌曲概念",
    form.concept || "未填写",
    "",
    sourceProject ? "## 来源故事 / Universe" : "",
    sourceProject ? summarizeSourceProject(sourceProject) : "",
    sourceProject ? "" : "",
    "## 创作沟通记录",
    developmentNotes || "未记录",
    "",
    "## 歌词",
    lyrics || "未生成",
    "",
    "## Music Prompt",
    stylePrompt || "未生成",
    "",
    "## 备注",
    audit ? auditReportText(audit) : "未审查",
  ].join("\n");
}

function songProjectToWorkbench(project: DramaProject) {
  const content = project.deliveryPackage || project.brief || "";
  const genres = splitCustom(project.genre || "").filter((item) => genreOptions.includes(item));
  const customGenre = splitCustom(project.genre || "").filter((item) => !genreOptions.includes(item)).join(", ");
  const form = normalizeStoredForm({
    ...initialForm,
    title: project.title || "",
    concept: project.idea || extractMarkdownSection(content, "歌曲概念"),
    sourceProjectId: typeof project.inheritanceSettings?.sourceProjectId === "string" ? project.inheritanceSettings.sourceProjectId : "",
    outputLanguage: normalizeOutputLanguage(project.targetLanguage),
    customLanguage: isKnownOutputLanguage(project.targetLanguage) ? "" : project.targetLanguage || "",
    genres: genres.length ? genres : initialForm.genres,
    customGenre,
    instruments: withGenreInstrumentDefaults(genres.length ? genres : initialForm.genres, initialForm.instruments),
  });
  const lyrics = project.finalScript || extractMarkdownSection(content, "歌词");
  const stylePrompt = mergeMusicPrompt(extractMarkdownSection(content, "Music Prompt") || extractMarkdownSection(content, "Style Prompt"), extractMarkdownSection(content, "Composition Prompt"));
  const compositionPrompt = "";
  const songDevelopmentNotes = extractMarkdownSection(content, "创作沟通记录");

  return {
    form,
    lyrics,
    stylePrompt,
    compositionPrompt,
    songDevelopmentNotes,
    audit: lyrics || stylePrompt || compositionPrompt
      ? auditLyrics(lyrics, stylePrompt, compositionPrompt, [], form)
      : null,
  };
}

function getSongEntry() {
  if (typeof window === "undefined") return { forceNew: false, projectId: "" };
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get("projectId") || "";
  return {
    forceNew: params.get("new") === "1" || !projectId,
    projectId,
  };
}

function mergeSourceProjects(localProjects: DramaProject[], cloudProjects: DramaProject[]) {
  const byId = new Map<string, DramaProject>();
  for (const project of [...localProjects, ...cloudProjects]) {
    const existing = byId.get(project.id);
    if (!existing || project.updatedAt.localeCompare(existing.updatedAt) > 0) {
      byId.set(project.id, project);
    }
  }
  return Array.from(byId.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function isSongSourceProject(project: DramaProject) {
  return project.workflowType !== "song" && project.workflowType !== "viral";
}

function buildSourceProjectSongConcept(project: DramaProject) {
  const source = summarizeSourceProject(project);
  return [
    `Create an OST/theme song for "${project.title}".`,
    source,
    "Focus on the protagonist's core conflict, the central emotional hook, and the long-running IP mood.",
  ].join("\n");
}

function summarizeSourceProject(project: DramaProject) {
  return [
    `Title: ${project.title || "Untitled"}`,
    `Workflow: ${project.workflowType}`,
    project.universeId ? `Universe ID: ${project.universeId}` : "",
    project.genre ? `Genre: ${project.genre}` : "",
    project.market ? `Market: ${project.market}` : "",
    project.idea ? `Idea: ${project.idea}` : "",
    project.brief ? `Brief: ${project.brief.slice(0, 600)}` : "",
    project.outline ? `Outline: ${project.outline.slice(0, 600)}` : "",
    project.storyBible?.logline ? `Logline: ${project.storyBible.logline}` : "",
    project.storyBible?.mainConflict ? `Main conflict: ${project.storyBible.mainConflict}` : "",
    project.storyBible?.characterRelationships ? `Characters: ${project.storyBible.characterRelationships.slice(0, 400)}` : "",
  ].filter(Boolean).join("\n");
}

function buildUniverseSongSeed(bundle: UniverseBundle) {
  return [
    `Create an OST/theme song for Universe "${bundle.universe.name}".`,
    bundle.universe.description ? `Universe premise: ${bundle.universe.description}` : "",
    bundle.universe.tone ? `Tone: ${bundle.universe.tone}` : "",
    bundle.entities.filter((item) => item.type === "character").slice(0, 6).map((item) => `Character: ${item.name} - ${item.summary}`).join("\n"),
    bundle.canonFacts.slice(0, 8).map((fact) => `Canon: ${fact.fact_text}`).join("\n"),
    bundle.snapshots.slice(0, 3).map((snapshot) => `State: ${snapshot.title} - ${snapshot.summary}`).join("\n"),
    "Write around the core emotional hook, the recurring IP motif, and the protagonist's unresolved desire.",
  ].filter(Boolean).join("\n");
}

function summarizeUniverseBundle(bundle: UniverseBundle) {
  return [
    `Universe: ${bundle.universe.name}`,
    bundle.universe.description,
    bundle.universe.tone ? `Tone: ${bundle.universe.tone}` : "",
    bundle.entities.filter((item) => item.type === "character").slice(0, 8).map((item) => `Character: ${item.name} - ${item.summary}`).join("\n"),
    bundle.canonFacts.slice(0, 10).map((fact) => `Canon: ${fact.fact_text}`).join("\n"),
  ].filter(Boolean).join("\n");
}

function extractMarkdownSection(markdown: string, heading: string) {
  if (!markdown.trim()) return "";
  const escaped = escapeRegExp(heading);
  const match = markdown.match(new RegExp(`(?:^|\\n)##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, "i"));
  return match?.[1]?.trim() || "";
}

function isKnownOutputLanguage(value: string) {
  return ["English", "Chinese", "Bilingual", "Japanese", "Korean", "Spanish", "French", "Cantonese"].includes(value);
}

function normalizeOutputLanguage(value: string): OutputLanguage {
  return isKnownOutputLanguage(value) ? value as OutputLanguage : value ? "Custom" : initialForm.outputLanguage;
}

function auditSummary(audit: AuditResult) {
  if (audit.items.length === 0) return "No risk items found.";
  return `${audit.items.length} item(s) found. Click audit to review the full result.`;
}

function auditReportText(audit: AuditResult) {
  if (audit.items.length === 0) {
    return "歌词审查通过。当前文本没有发现明显的引用艺人、过长风格提示词或高风险对白式表达，可以继续复制或进入下一轮修改。";
  }

  const statusText = audit.allowCopy ? "当前可以复制，但建议先处理以下提示。" : "当前包含高风险内容，建议修改后再复制。";
  const details = audit.items
    .map((item) => `${item.severity.toUpperCase()} · ${item.message} ${item.suggestion}`)
    .join(" ");
  return `${statusText} ${details}`;
}

function parseSongGeneration(output: string) {
  const section = (name: string) => {
    const pattern = new RegExp(`---${name}---\\s*([\\s\\S]*?)(?=\\n---[A-Z_]+---|$)`, "i");
    return output.match(pattern)?.[1]?.trim() || "";
  };

  const lyrics = section("LYRICS") || output.match(/(?:^|\n)#+\s*(?:lyrics|歌词)\s*\n([\s\S]*?)(?=\n#+\s*|$)/i)?.[1]?.trim() || "";
  const stylePrompt = section("MUSIC_PROMPT")
    || section("STYLE_PROMPT")
    || output.match(/(?:music prompt|style prompt|音乐生成提示词|风格提示词)\s*[:：]\s*([\s\S]*?)(?=\n(?:composition prompt|编曲提示词)\s*[:：]|$)/i)?.[1]?.trim()
    || "";
  const compositionPrompt = section("COMPOSITION_PROMPT") || output.match(/(?:composition prompt|编曲提示词)\s*[:：]\s*([\s\S]*)$/i)?.[1]?.trim() || "";

  return { lyrics, stylePrompt: mergeMusicPrompt(stylePrompt, compositionPrompt), compositionPrompt: "" };
}

function normalizedGenres(form: SongForm) {
  return [...form.genres, ...splitCustom(form.customGenre)].filter(Boolean);
}

function normalizedInstruments(form: SongForm) {
  return [...form.instruments, ...splitCustom(form.customInstrument)].filter(Boolean);
}

function recommendedInstrumentsForGenre(genre: string) {
  return genreInstrumentPresets[genre]?.filter((item) => instrumentOptions.includes(item)) || [];
}

function withGenreInstrumentDefaults(genres: string[], instruments: string[]) {
  return Array.from(new Set([...instruments, ...genres.flatMap(recommendedInstrumentsForGenre)]));
}

function specifiedValue(value: string) {
  return value && value !== "Not specified" ? value : "";
}

function splitCustom(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function appendSongNotes(current: string, role: string, content: string) {
  const next = [current.trim(), `${role}: ${content.trim()}`].filter(Boolean).join("\n\n");
  return next.length > 24000 ? next.slice(-24000) : next;
}

function buildSongByoApi(provider: SongModelProvider) {
  const config = readByoApiConfig("song");
  if (provider === "auto") return config;
  return { ...(config || {}), provider };
}

function buildSongChatContext(
  form: SongForm,
  notes: string,
  messages: SongChatMessage[],
  lyrics: string,
  musicPrompt: string,
  uploadedReference: UploadedReference | null,
  sourceProject: DramaProject | null,
  universeBundle: UniverseBundle | null,
) {
  return [
    `Project title: ${form.title || "Untitled song"}`,
    `Output language: ${form.outputLanguage === "Custom" ? form.customLanguage || "Custom" : form.outputLanguage}`,
    form.concept ? `Current concept:\n${form.concept}` : "",
    notes ? `Saved development notes:\n${notes}` : "",
    uploadedReference ? `Uploaded reference (${uploadedReference.type}, ${uploadedReference.mode}):\n${uploadedReference.text}` : "",
    lyrics ? `Current lyrics:\n${lyrics}` : "",
    musicPrompt ? `Current Suno style prompt:\n${musicPrompt}` : "",
    sourceProject ? `Source project:\n${summarizeSourceProject(sourceProject)}` : "",
    universeBundle ? `Universe:\n${summarizeUniverseBundle(universeBundle)}` : "",
    messages.length ? `Recent visible chat:\n${messages.slice(-8).map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n")}` : "",
  ].filter(Boolean).join("\n\n");
}

function buildLyrics(form: SongForm, singers: SingerProfile[]) {
  const projectType = projectTypes.find((item) => item.value === form.projectType);
  const languageHint = form.outputLanguage === "Custom" ? form.customLanguage || "custom language" : form.outputLanguage;
  const singerCue = buildSingerCue(singers);
  const concept = form.concept.trim();
  const mood = [form.primaryEmotion, ...form.secondaryEmotions].join(", ");
  const hook = buildHookLine(form);

  const enhanced = `[Intro - 3 seconds]
(${[specifiedValue(form.groove), normalizedInstruments(form).slice(0, 4).join(", ") || "lean arrangement"].filter(Boolean).join("; ")} enters with a clear motif)

[Verse 1 - ${singerCue}]
The room keeps counting every sign
Cold light crawling through the blinds
${lineFromConcept(concept, "image")}
I wear a smile that barely stays

[Pre-Chorus]
One more breath before the fall
One more name I never call
The silence leans against the door
And I know what I came here for

[Chorus]
${hook}
${hook}
I turn the ache into a flame
And leave the old fear without a name

[Verse 2 - ${singerCue}]
${lineFromConcept(concept, "motion")}
The pavement hums under my shoes
I keep the truth close to my chest
Then let the rhythm do the rest

[Bridge]
(${projectType?.strategy || "focused emotional lift"}; arrangement drops, voice moves closer)
No borrowed words, no famous ghosts
Just this heart and what it knows
The night bends open, line by line
I take the ending and make it mine

[Final Chorus - Full arrangement]
${hook}
${hook}
I turn the ache into a flame
And leave the old fear without a name

[Outro]
(${languageHint} vocal tails out; ${mood} resolves into a restrained final chord)`;

  if (form.lyricsMode === "plain_lyrics") return stripParentheticalHints(enhanced);
  if (form.lyricsMode === "no_tags") return stripTagsAndHints(enhanced);
  return sanitizeForbidden(enhanced, singers);
}

function buildStylePrompt(form: SongForm, singers: SingerProfile[]) {
  return buildMusicPrompt(form, singers);
}

function buildMusicPrompt(form: SongForm, singers: SingerProfile[]) {
  const genres = normalizedGenres(form).slice(0, 4).join(", ");
  const singerTerms = singers.flatMap((singer) => singer.safePromptTerms).slice(0, 2).join(", ");
  const instruments = normalizedInstruments(form).slice(0, 4).join(", ");
  const prompt = [
    genres,
    `${form.primaryEmotion} song`,
    singerTerms,
    instruments,
    specifiedValue(form.groove),
    specifiedValue(form.key),
    "hook-driven chorus",
    "concise motif",
    "verse lift into repeatable chorus",
    "clean modern production-ready mix",
  ].filter(Boolean).join(", ");
  return trimPromptBytes(sanitizeForbidden(prompt, singers), MUSIC_PROMPT_MAX_BYTES);
}

function buildCompositionPrompt(form: SongForm, singers: SingerProfile[]) {
  const instruments = normalizedInstruments(form).slice(0, 6).join(", ") || "a lean arrangement";
  const groove = specifiedValue(form.groove);
  const key = specifiedValue(form.key);
  const prompt = [
    `Start with a concise motif, build around ${instruments}`,
    "keep verses lean",
    "lift the pre-chorus",
    "make the chorus repeatable",
    groove ? `use ${groove}` : "",
    key ? `center the harmony around ${key}` : "",
    "then drop into a bridge before a fuller final chorus and clean outro",
  ].filter(Boolean).join(", ");
  return trimPrompt(sanitizeForbidden(prompt, singers), 350);
}

function buildSingerCue(singers: SingerProfile[]) {
  if (singers.length > 1) return "Male and Female Harmony";
  const singer = singers[0];
  if (!singer) return "Lead Vocal";
  if (singer.gender.toLowerCase().includes("female")) return "Female Vocal";
  if (singer.gender.toLowerCase().includes("male")) return "Male Vocal";
  return "Lead Vocal";
}

function buildHookLine(form: SongForm) {
  if (form.primaryEmotion.includes("讽刺")) return `${form.title || "Monday"}, I am not ready`;
  if (form.primaryEmotion.includes("热血")) return `${form.title || "Tonight"}, we rise again`;
  if (form.primaryEmotion.includes("浪漫")) return `${form.title || "Stay"}, you glow in the dark`;
  if (form.primaryEmotion.includes("悲伤")) return `${form.title || "Goodbye"}, I still carry the sound`;
  return `${form.title || "Tonight"}, I turn the dark into sound`;
}

function lineFromConcept(concept: string, mode: "image" | "motion") {
  const clean = concept.replace(/[.!?。！？]+$/g, "").trim();
  if (!clean) return mode === "image" ? "A small scene waits inside my head" : "I cross the street with nothing to lose";
  const words = clean.split(/\s+/).slice(0, 10).join(" ");
  return mode === "image" ? `I see ${words}` : `I move through ${words}`;
}

function stripParentheticalHints(value: string) {
  return value.replace(/^\([^)]*\)\n?/gm, "").trim();
}

function stripTagsAndHints(value: string) {
  return stripParentheticalHints(value).replace(/^\[[^\]]+\]\n?/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function sanitizeForbidden(value: string, singers: SingerProfile[]) {
  return singers
    .flatMap((singer) => singer.forbiddenOutputTerms)
    .filter(Boolean)
    .reduce((output, term) => output.replace(new RegExp(escapeRegExp(term), "gi"), "reference vocal"), value);
}

function trimPrompt(value: string, max: number) {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd();
}

function mergeMusicPrompt(stylePrompt: string, compositionPrompt: string) {
  return trimPromptBytes([stylePrompt, compositionPrompt].map((item) => item.trim()).filter(Boolean).join(", "), MUSIC_PROMPT_MAX_BYTES);
}

function shouldSkipLyricsTranslation(value: string, targetLanguage: LyricsTranslationLanguage) {
  return targetLanguage === "Chinese" && isMostlyChinese(value);
}

function isMostlyChinese(value: string) {
  const chars = value.replace(/\s/g, "");
  if (!chars) return false;
  const chineseCount = Array.from(chars).filter((char) => /[\u3400-\u9fff]/.test(char)).length;
  return chineseCount / chars.length > 0.25;
}

function formatFileSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function auditLyrics(
  lyrics: string,
  stylePrompt: string,
  compositionPrompt: string,
  singers: SingerProfile[],
  form?: SongForm,
): AuditResult {
  const items: AuditItem[] = [];
  const joined = `${lyrics}\n${stylePrompt}\n${compositionPrompt}`;
  const forbidden = singers.flatMap((singer) => singer.forbiddenOutputTerms).filter(Boolean);
  const lyricLines = lyrics.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const uniqueLyricLines = new Set(lyricLines.map((line) => line.toLowerCase()));
  const genres = form ? normalizedGenres(form) : [];
  const instruments = form ? normalizedInstruments(form) : [];

  if (!lyrics.trim()) {
    items.push({
      type: "missing_lyrics",
      severity: "high",
      message: "歌词为空，无法完成审查。",
      suggestion: "先生成或粘贴完整歌词，再运行歌词审查。",
    });
  } else if (lyricLines.length < 8) {
    items.push({
      type: "lyrics_too_short",
      severity: "medium",
      message: "歌词行数偏少，可能不足以支撑完整歌曲结构。",
      suggestion: "补足主歌、副歌和桥段，或把短视频歌曲明确写成 hook-first 结构。",
    });
  }

  for (const term of forbidden) {
    if (new RegExp(escapeRegExp(term), "i").test(joined)) {
      items.push({
        type: "artist_name_misuse",
        severity: "high",
        message: `输出中包含禁用的参考艺人或歌手词：${term}。`,
        suggestion: "改成中性的声线描述，例如 male vocal、female vocal、duet、harmony 或 rap vocal。",
      });
    }
  }

  if (/\b(she said|he said|i said|they said|told me|mama said|mother said)\b/i.test(lyrics)) {
    items.push({
      type: "quoted_or_dialogue_lyric",
      severity: "medium",
      message: "歌词中出现对白式 said/told 表达。",
      suggestion: "改写成内心独白或画面叙述，减少直接对白感。",
    });
  }

  if (form?.lyricsMode !== "no_tags" && lyrics.trim() && !/\[(intro|verse|pre[-\s]?chorus|chorus|hook|bridge|outro|final chorus|主歌|副歌|桥段|间奏|尾奏)[^\]]*\]/i.test(lyrics)) {
    items.push({
      type: "missing_section_tags",
      severity: form?.lyricsMode === "enhanced_lyrics" ? "medium" : "low",
      message: "当前歌词缺少清晰段落标签。",
      suggestion: "为 Intro、Verse、Pre-Chorus、Chorus、Bridge、Outro 添加段落标签，便于后续模型演唱和编曲。",
    });
  }

  if (lyrics.trim() && !/(chorus|hook|副歌|钩子)/i.test(lyrics)) {
    items.push({
      type: "missing_hook",
      severity: "medium",
      message: "没有检测到明确的副歌或 hook。",
      suggestion: "补一个可重复、可记忆的 Chorus/Hook，并让标题或核心意象在副歌中出现。",
    });
  }

  const longLine = lyricLines.find((line) => line.length > 110);
  if (longLine) {
    items.push({
      type: "line_too_long",
      severity: "low",
      message: "检测到过长歌词行，可能影响演唱断句。",
      suggestion: `拆分这一行：${longLine.slice(0, 54)}...`,
    });
  }

  if (lyricLines.length >= 8 && uniqueLyricLines.size / lyricLines.length < 0.6) {
    items.push({
      type: "over_repetition",
      severity: "low",
      message: "歌词重复比例偏高。",
      suggestion: "保留副歌复现，但让主歌和桥段提供新的画面、动作或情绪推进。",
    });
  }

  if (!stylePrompt.trim()) {
    items.push({
      type: "missing_style_prompt",
      severity: "medium",
      message: "Style Prompt 为空。",
      suggestion: "补充曲风、情绪、声线、乐器和混音方向，便于音乐模型稳定生成。",
    });
  } else if (stylePrompt.length > 250) {
    items.push({
      type: "style_prompt_length",
      severity: "medium",
      message: "Style Prompt 超过推荐长度。",
      suggestion: "只保留最关键的曲风、声线、乐器和混音描述，避免堆叠过多形容词。",
    });
  } else if (stylePrompt.trim().length < 24) {
    items.push({
      type: "style_prompt_too_sparse",
      severity: "low",
      message: "Style Prompt 信息偏少。",
      suggestion: "至少写清曲风、主情绪、核心乐器和制作质感。",
    });
  }

  if (genres.length > 0 && !genres.some((genre) => new RegExp(escapeRegExp(genre), "i").test(stylePrompt))) {
    items.push({
      type: "style_genre_missing",
      severity: "low",
      message: "Style Prompt 没有包含已选择的目标曲风。",
      suggestion: `把 ${genres.slice(0, 3).join(", ")} 写入 Style Prompt，保持设定和输出一致。`,
    });
  }

  if (instruments.length > 0 && !instruments.some((instrument) => new RegExp(escapeRegExp(instrument), "i").test(`${stylePrompt}\n${compositionPrompt}`))) {
    items.push({
      type: "instrument_missing",
      severity: "low",
      message: "提示词中没有体现已选择的乐器。",
      suggestion: `把 ${instruments.slice(0, 4).join(", ")} 写入 Style 或 Composition Prompt。`,
    });
  }

  if (!compositionPrompt.trim()) {
    items.push({
      type: "missing_composition_prompt",
      severity: "medium",
      message: "Composition Prompt 为空。",
      suggestion: "补充 intro、verse、chorus、bridge、outro 的编曲推进方式。",
    });
  } else if (!/(intro|verse|pre[-\s]?chorus|chorus|hook|bridge|outro|主歌|副歌|桥段)/i.test(compositionPrompt)) {
    items.push({
      type: "composition_structure_missing",
      severity: "low",
      message: "Composition Prompt 缺少结构推进信息。",
      suggestion: "明确每个段落的能量变化，例如主歌收束、副歌抬升、桥段抽离、最终副歌加厚。",
    });
  }

  const hasHigh = items.some((item) => item.severity === "high");
  const hasMedium = items.some((item) => item.severity === "medium");
  const hasLow = items.some((item) => item.severity === "low");

  return {
    status: hasHigh ? "high_risk" : hasMedium ? "medium_risk" : hasLow ? "low_risk" : "pass",
    allowCopy: !hasHigh,
    items,
  };
}

function reviseLyrics(lyrics: string, instruction: string) {
  const note = `(Revision note: ${instruction})`;
  return `${lyrics.trim()}\n\n[Revision Direction]\n${note}`;
}

async function readJsonResponse<T extends { error?: string }>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return { error: text.slice(0, 240) } as T;
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
