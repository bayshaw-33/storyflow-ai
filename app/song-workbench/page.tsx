"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Copy, Plus } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { useI18n } from "@/lib/i18n/useI18n";

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

const STORAGE_KEY = "kiikis-song-workbench-v1";

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
const structureOptions = ["Standard song structure", "Short-video hook first", "OST gradual build", "BGM light-lyrics structure", "Rap + Chorus structure", "Duet structure", "Ensemble structure"];

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
  return {
    ...value,
    structure: value.structure === ["Standard Su", "no song structure"].join("") ? "Standard song structure" : value.structure,
    lyricsMode: (value.lyricsMode as string) === ["su", "no_enhanced"].join("") ? "enhanced_lyrics" : value.lyricsMode,
    primaryEmotion: value.primaryEmotion === ["燃", " / 胜利"].join("") ? "热血 / 胜利" : value.primaryEmotion,
    secondaryEmotions: [],
  };
}

const initialForm: SongForm = {
  title: "",
  projectType: "original_song",
  outputLanguage: "English",
  customLanguage: "",
  concept: "",
  primaryEmotion: "讽刺 / 荒诞",
  secondaryEmotions: [],
  genres: ["Lo-fi", "Indie Pop", "Pop Rock"],
  customGenre: "",
  selectedSingerIds: ["dry-sarcastic-male"],
  groove: "mid-tempo pop, 76-95 BPM",
  key: "G minor",
  instruments: ["electric piano", "fuzzy bassline", "lo-fi drums"],
  customInstrument: "",
  structure: "Standard song structure",
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
    audit: "Lyrics audit",
    revision: "Revision",
    history: "Version history",
    titleField: "Project title",
    projectType: "Project type",
    outputLanguage: "Output language",
    concept: "Song concept",
    primaryEmotion: "Primary emotion",
    genres: "Target genres",
    singers: "Singer tags",
    generate: "Generate idea",
    generating: "Generating",
    saveVersion: "Save version",
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
    required: "Please fill title, concept, at least one genre, and at least one singer tag.",
    signInRequired: "Please sign in before using AI generation.",
    noVersions: "No versions yet.",
    auditPass: "Audit before copying lyrics.",
    revise: "Apply revision",
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
    audit: "歌词审查",
    revision: "修改指令",
    history: "版本历史",
    titleField: "项目标题",
    projectType: "项目类型",
    outputLanguage: "输出语言",
    concept: "歌曲概念",
    primaryEmotion: "主情绪",
    genres: "目标曲风",
    singers: "歌手标签",
    generate: "生成创意",
    generating: "生成中",
    saveVersion: "保存版本",
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
    required: "请填写标题、歌曲概念，并至少选择一个曲风和一个歌手标签。",
    signInRequired: "请先登录后再调用 AI 生成。",
    noVersions: "暂无版本。",
    auditPass: "复制歌词前建议先审查。",
    revise: "应用修改",
    revisionPlaceholder: "例如：把副歌改得更洗脑，但保留主 hook。",
  },
};

export default function SongWorkbenchPage() {
  const { locale, t } = useI18n();
  const text = i18n[locale];
  const [form, setForm] = useState<SongForm>(initialForm);
  const [singers, setSingers] = useState<SingerProfile[]>(defaultSingers);
  const [lyrics, setLyrics] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [compositionPrompt, setCompositionPrompt] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [versions, setVersions] = useState<SongVersion[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [songProjectId, setSongProjectId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [auditOpen, setAuditOpen] = useState(false);
  const [singerDraft, setSingerDraft] = useState<SingerProfile | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session?.user.id) {
      setSongProjectId(null);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    void supabase
      .from("storyflow_projects")
      .select("id")
      .eq("user_id", session.user.id)
      .eq("workflow_type", "song")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.id) setSongProjectId(String(data.id));
      });
  }, [session?.user.id]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const data = JSON.parse(stored);
      if (data.form) setForm(normalizeStoredForm(data.form));
      if (data.singers) setSingers(data.singers);
      if (data.lyrics) setLyrics(data.lyrics);
      if (data.stylePrompt) setStylePrompt(data.stylePrompt);
      if (data.compositionPrompt) setCompositionPrompt(data.compositionPrompt);
      if (data.audit) setAudit(data.audit);
      if (data.versions) setVersions(data.versions);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ form, singers, lyrics, stylePrompt, compositionPrompt, audit, versions }),
    );
  }, [form, singers, lyrics, stylePrompt, compositionPrompt, audit, versions]);

  const selectedSingers = useMemo(
    () => uniqueSingerProfiles(singers).filter((singer) => form.selectedSingerIds.includes(singer.id)),
    [form.selectedSingerIds, singers],
  );
  const singerOptions = useMemo(() => uniqueSingerProfiles(singers), [singers]);

  const canCopyLyrics = !audit || audit.allowCopy;

  function updateForm<K extends keyof SongForm>(key: K, value: SongForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
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

  function validateForm() {
    const genres = normalizedGenres(form);
    return Boolean(form.title.trim() && form.concept.trim() && genres.length > 0 && selectedSingers.length > 0);
  }

  async function generateAll(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setError("");
    if (!validateForm()) {
      setError(text.required);
      return;
    }
    if (!session?.access_token) {
      setError(text.signInRequired);
      return;
    }

    setGenerating(true);
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
          input: buildSongGenerationInput(form, selectedSingers),
          context: [
            lyrics.trim() ? `Existing lyrics to improve or replace:\n${lyrics}` : "",
            stylePrompt.trim() ? `Existing style prompt:\n${stylePrompt}` : "",
            compositionPrompt.trim() ? `Existing composition prompt:\n${compositionPrompt}` : "",
          ].filter(Boolean).join("\n\n"),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload?.success) throw new Error(payload?.error || "AI generation failed.");

      const parsed = parseSongGeneration(payload.output || "");
      const nextLyrics = sanitizeForbidden(parsed.lyrics || payload.output || "", selectedSingers);
      const nextStylePrompt = trimPrompt(sanitizeForbidden(parsed.stylePrompt || buildStylePrompt(form, selectedSingers), selectedSingers), 280);
      const nextCompositionPrompt = trimPrompt(sanitizeForbidden(parsed.compositionPrompt || buildCompositionPrompt(form, selectedSingers), selectedSingers), 420);
      const nextAudit = auditLyrics(nextLyrics, nextStylePrompt, nextCompositionPrompt, selectedSingers);

      setLyrics(nextLyrics);
      setStylePrompt(nextStylePrompt);
      setCompositionPrompt(nextCompositionPrompt);
      setAudit(nextAudit);
      void saveVersion("AI generation", "Generated lyrics and prompts through AI.", nextLyrics, nextStylePrompt, nextCompositionPrompt, nextAudit.status);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "AI generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  async function saveVersion(changeType = "Manual save", summary = "Saved current workbench state.", nextLyrics = lyrics, nextStyle = stylePrompt, nextComposition = compositionPrompt, nextStatus = audit?.status || "pass") {
    const version: SongVersion = {
      id: `song-version-${Date.now()}`,
      versionNumber: versions.length + 1,
      changeType,
      summary,
      auditStatus: nextStatus,
      lyrics: nextLyrics,
      stylePrompt: nextStyle,
      compositionPrompt: nextComposition,
      createdAt: new Date().toISOString(),
    };
    setVersions((current) => [version, ...current]);
    await syncSongProjectStub();
  }

  async function syncSongProjectStub() {
    if (!session?.user.id) return;

    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const title = form.title.trim() || "未命名歌曲";

    try {
      if (songProjectId) {
        const { error: updateError } = await supabase
          .from("storyflow_projects")
          .update({
            title,
            updated_at: new Date().toISOString(),
          })
          .eq("id", songProjectId)
          .eq("user_id", session.user.id);

        if (updateError) throw updateError;
        return;
      }

      const { data, error: insertError } = await supabase
        .from("storyflow_projects")
        .insert({
          user_id: session.user.id,
          title,
          workflow_type: "song",
          market: "",
          genre: "音乐",
          language: "zh",
          data: { songWorkbenchKey: STORAGE_KEY },
        })
        .select("id")
        .single();

      if (insertError) throw insertError;
      if (data?.id) setSongProjectId(String(data.id));
    } catch {
      setError(locale === "zh-CN" ? "歌曲项目已保存到本地，但同步到 Dashboard 失败。" : "Song saved locally, but Dashboard sync failed.");
    }
  }

  function runAudit() {
    const nextAudit = auditLyrics(lyrics, stylePrompt, compositionPrompt, selectedSingers);
    setAudit(nextAudit);
    setAuditOpen(true);
  }

  function applyRevision() {
    const instruction = revisionInstruction.trim();
    if (!instruction || !lyrics.trim()) return;
    const nextLyrics = reviseLyrics(lyrics, instruction);
    const nextAudit = auditLyrics(nextLyrics, stylePrompt, compositionPrompt, selectedSingers);
    setLyrics(nextLyrics);
    setAudit(nextAudit);
    setRevisionInstruction("");
    void saveVersion("Revision", instruction, nextLyrics, stylePrompt, compositionPrompt, nextAudit.status);
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
    setStylePrompt(version.stylePrompt);
    setCompositionPrompt(version.compositionPrompt);
    setAudit(auditLyrics(version.lyrics, version.stylePrompt, version.compositionPrompt, selectedSingers));
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

  return (
    <main className="cosmic-page song-workbench-page">
      <section className="cosmic-title-band">
        <h1>{text.title}</h1>
      </section>

      <section className="song-workbench-shell">
        {error ? <div className="notice error">{error}</div> : null}

        <form id="song-workbench-form" className="dashboard-panel song-setup-panel" onSubmit={generateAll}>
          <div className="dashboard-panel-head">
            <div>
              <span>{text.setup}</span>
              <h2>{form.title || text.concept}</h2>
            </div>
          </div>

          <div className="song-field-stack">
            <label>
              {text.titleField}
              <input
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="Monday Snooze / Midnight Confession / 夏天没有说再见"
              />
            </label>
            <label>
              {text.projectType}
              <select value={form.projectType} onChange={(event) => updateForm("projectType", event.target.value as SongProjectType)}>
                {projectTypes.map((option) => (
                  <option key={option.value} value={option.value}>{locale === "zh-CN" ? option.label : option.labelEn}</option>
                ))}
              </select>
            </label>
            <label>
              {text.outputLanguage}
              <select value={form.outputLanguage} onChange={(event) => updateForm("outputLanguage", event.target.value as OutputLanguage)}>
                {["English", "Chinese", "Bilingual", "Japanese", "Korean", "Spanish", "French", "Cantonese", "Custom"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              {text.primaryEmotion}
              <select
                value={form.primaryEmotion}
                onChange={(event) => setForm((current) => ({ ...current, primaryEmotion: event.target.value, secondaryEmotions: [] }))}
              >
                {primaryEmotionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {locale === "zh-CN" ? option.value : option.labelEn}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label>
            {text.concept}
            <textarea
              className="song-concept-textarea"
              value={form.concept}
              onChange={(event) => updateForm("concept", event.target.value)}
              placeholder="A burned-out office worker fights another miserable Monday with sarcasm and dark humor."
            />
          </label>

          <details className="song-control-group">
            <summary>{text.genres}</summary>
            <div className="song-group-stack song-details-body">
              {genreGroups.map((group) => (
                <div className="song-option-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <div className="song-chip-grid">
                    {group.options.map((option) => (
                      <label key={option}>
                        <input
                          type="checkbox"
                          checked={form.genres.includes(option)}
                          onChange={() => toggleListValue("genres", option)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <input
                value={form.customGenre}
                onChange={(event) => updateForm("customGenre", event.target.value)}
                placeholder="Custom genre tags, comma separated"
              />
            </div>
          </details>

          <section className="song-control-group">
            <div className="song-section-head">
              <span>{text.singerLibrary}</span>
              <button className="icon-button" type="button" title={text.newSinger} onClick={() => openSingerEditor()}>
                <Plus size={15} />
              </button>
            </div>
            <div className="song-singer-grid">
              {singerOptions.map((singer) => (
                <article className="song-singer-card" key={singer.id}>
                  <input
                    type="checkbox"
                    aria-label={singer.displayName}
                    checked={form.selectedSingerIds.includes(singer.id)}
                    onChange={() => toggleListValue("selectedSingerIds", singer.id)}
                  />
                  <button type="button" onClick={() => openSingerEditor(singer)}>
                    <strong>{singer.displayName}</strong>
                    <small>{singer.gender} / {singer.language.join(", ")}</small>
                    <p>{singer.safePromptTerms.join(", ")}</p>
                  </button>
                </article>
              ))}
            </div>
          </section>

          <details className="song-control-group">
            <summary>{locale === "zh-CN" ? "乐器 / 编曲元素" : "Instruments / Arrangement"}</summary>
            <div className="song-group-stack song-details-body">
              {instrumentGroups.map((group) => (
                <div className="song-option-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <div className="song-chip-grid">
                    {group.options.map((option) => (
                      <label key={option}>
                        <input
                          type="checkbox"
                          checked={form.instruments.includes(option)}
                          onChange={() => toggleListValue("instruments", option)}
                        />
                        {option}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <input
                value={form.customInstrument}
                onChange={(event) => updateForm("customInstrument", event.target.value)}
                placeholder="Custom instruments, comma separated"
              />
            </div>
          </details>

          <details className="song-control-group">
            <summary>{text.advanced}</summary>
            <div className="song-field-stack song-details-body">
              <label>
                {locale === "zh-CN" ? "律动 / 速度" : "Groove"}
                <select value={form.groove} onChange={(event) => updateForm("groove", event.target.value)}>
                  {grooveOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                {locale === "zh-CN" ? "调性" : "Key"}
                <select value={form.key} onChange={(event) => updateForm("key", event.target.value)}>
                  {keyOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                {locale === "zh-CN" ? "歌词结构" : "Lyrics structure"}
                <select value={form.structure} onChange={(event) => updateForm("structure", event.target.value)}>
                  {structureOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>
              <label>
                {locale === "zh-CN" ? "歌词格式" : "Lyrics output mode"}
                <select value={form.lyricsMode} onChange={(event) => updateForm("lyricsMode", event.target.value as LyricsMode)}>
                  <option value="enhanced_lyrics">{t("song.format.enhanced")}</option>
                  <option value="plain_lyrics">{t("song.format.plainLyrics")}</option>
                  <option value="no_tags">{t("song.format.noTags")}</option>
                </select>
              </label>
            </div>
          </details>
        </form>

        <section className="dashboard-panel song-output-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.outputs}</span>
            </div>
            <button className="primary-button" type="submit" form="song-workbench-form" disabled={generating}>
              {generating ? text.generating : text.generate}
            </button>
          </div>
          <div className="song-output-grid">
            <label className="song-output-card">
              <span className="song-output-card-head">
                {text.lyrics}
                <button className="icon-button" type="button" title={text.copy} disabled={!lyrics || !canCopyLyrics} onClick={() => copyText(lyrics, true)}>
                  <Copy size={15} />
                </button>
              </span>
              <textarea className="song-lyrics-textarea" value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder="[Intro - 3 seconds]..." />
            </label>
            <label className="song-output-card">
              <span className="song-output-card-head">
                {text.stylePrompt}
                <button className="icon-button" type="button" title={text.copy} disabled={!stylePrompt} onClick={() => copyText(stylePrompt)}>
                  <Copy size={15} />
                </button>
              </span>
              <textarea className="song-prompt-textarea" value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} />
            </label>
          </div>
        </section>

        <aside className="dashboard-panel song-ai-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.tools}</span>
              <h2>{text.audit}</h2>
            </div>
          </div>

          <div className="song-tool-section">
            <div className="song-tool-head">
              <span>{text.audit}</span>
              <button className="secondary-button" type="button" onClick={runAudit}>{text.audit}</button>
            </div>
            <p className="subtle">{audit ? auditSummary(audit) : text.auditPass}</p>
          </div>

          <div className="song-tool-section">
            <div className="song-tool-head">
              <span>{text.revision}</span>
              <button className="primary-button" type="button" onClick={applyRevision}>{text.revise}</button>
            </div>
            <label>
              {locale === "zh-CN" ? "指令" : "Instruction"}
              <textarea className="song-revision-textarea" value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} placeholder={text.revisionPlaceholder} />
            </label>
          </div>

          <div className="song-tool-section">
            <div className="song-tool-head">
              <span>{text.history}</span>
              <button className="secondary-button" type="button" onClick={() => void saveVersion()}>{text.saveVersion}</button>
            </div>
            <div className="settings-list song-history-list">
              {versions.length === 0 ? <p className="subtle">{text.noVersions}</p> : null}
              {versions.map((version) => (
                <button className="settings-card song-version-card" type="button" key={version.id} onClick={() => previewVersion(version)}>
                  <span>v{version.versionNumber} / {version.auditStatus}</span>
                  <h3>{version.changeType}</h3>
                  <p>{version.summary}</p>
                  <p>{new Date(version.createdAt).toLocaleString()}</p>
                </button>
              ))}
            </div>
          </div>
        </aside>
      </section>

      {auditOpen && audit ? (
        <div className="modal-backdrop">
          <div className="modal song-audit-modal">
            <h2>{text.audit}</h2>
            <p>{auditReportText(audit)}</p>
            <div className="modal-actions">
              <button className="primary-button" type="button" onClick={() => setAuditOpen(false)}>{text.close}</button>
            </div>
          </div>
        </div>
      ) : null}

      {singerDraft ? (
        <div className="modal-backdrop">
          <div className="modal song-singer-modal">
            <div className="dashboard-panel-head">
              <div>
                <span>{text.singerDetails}</span>
                <h2>{singerDraft.displayName || text.newSinger}</h2>
              </div>
              <button className="secondary-button" type="button" onClick={() => copyText(formatSingerProfile(singerDraft))}>
                <Copy size={15} /> {text.copy}
              </button>
            </div>
            <div className="song-singer-form">
              <label>
                {text.singers}
                <input value={singerDraft.displayName} onChange={(event) => updateSingerDraft("displayName", event.target.value)} autoFocus />
              </label>
              <label>
                {text.gender}
                <input value={singerDraft.gender} onChange={(event) => updateSingerDraft("gender", event.target.value)} />
              </label>
              <label>
                {text.language}
                <input value={singerDraft.language.join(", ")} onChange={(event) => updateSingerDraft("language", splitCustom(event.target.value))} />
              </label>
              <label>
                {text.genres}
                <input value={singerDraft.genres.join(", ")} onChange={(event) => updateSingerDraft("genres", splitCustom(event.target.value))} />
              </label>
              <label>
                {text.voiceTexture}
                <input value={singerDraft.voiceTexture.join(", ")} onChange={(event) => updateSingerDraft("voiceTexture", splitCustom(event.target.value))} />
              </label>
              <label>
                {text.delivery}
                <input value={singerDraft.delivery.join(", ")} onChange={(event) => updateSingerDraft("delivery", splitCustom(event.target.value))} />
              </label>
              <label>
                {text.safePromptTerms}
                <textarea value={singerDraft.safePromptTerms.join(", ")} onChange={(event) => updateSingerDraft("safePromptTerms", splitCustom(event.target.value))} />
              </label>
              <label>
                {text.forbiddenOutputTerms}
                <textarea value={singerDraft.forbiddenOutputTerms.join(", ")} onChange={(event) => updateSingerDraft("forbiddenOutputTerms", splitCustom(event.target.value))} placeholder={text.referenceArtist} />
              </label>
              <label className="song-singer-form-full">
                {text.notes}
                <textarea value={singerDraft.notes} onChange={(event) => updateSingerDraft("notes", event.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <button className="secondary-button" type="button" onClick={() => setSingerDraft(null)}>{text.close}</button>
              <button className="secondary-button" type="button" onClick={deleteSingerDraft}>{text.delete}</button>
              <button className="primary-button" type="button" onClick={saveSingerDraft}>{text.save}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function buildSongGenerationInput(form: SongForm, singers: SingerProfile[]) {
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
      singers: singers.map((singer) => ({
        displayName: singer.displayName,
        safePromptTerms: singer.safePromptTerms,
        forbiddenOutputTerms: singer.forbiddenOutputTerms,
        voiceTexture: singer.voiceTexture,
        delivery: singer.delivery,
      })),
      groove: form.groove,
      key: form.key,
      instruments: normalizedInstruments(form),
      structure: form.structure,
    },
    null,
    2,
  );
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
  const stylePrompt = section("STYLE_PROMPT") || output.match(/(?:style prompt|风格提示词)\s*[:：]\s*([\s\S]*?)(?=\n(?:composition prompt|编曲提示词)\s*[:：]|$)/i)?.[1]?.trim() || "";
  const compositionPrompt = section("COMPOSITION_PROMPT") || output.match(/(?:composition prompt|编曲提示词)\s*[:：]\s*([\s\S]*)$/i)?.[1]?.trim() || "";

  return { lyrics, stylePrompt, compositionPrompt };
}

function normalizedGenres(form: SongForm) {
  return [...form.genres, ...splitCustom(form.customGenre)].filter(Boolean);
}

function normalizedInstruments(form: SongForm) {
  return [...form.instruments, ...splitCustom(form.customInstrument)].filter(Boolean);
}

function splitCustom(value: string) {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function buildLyrics(form: SongForm, singers: SingerProfile[]) {
  const projectType = projectTypes.find((item) => item.value === form.projectType);
  const languageHint = form.outputLanguage === "Custom" ? form.customLanguage || "custom language" : form.outputLanguage;
  const singerCue = buildSingerCue(singers);
  const concept = form.concept.trim();
  const mood = [form.primaryEmotion, ...form.secondaryEmotions].join(", ");
  const hook = buildHookLine(form);

  const enhanced = `[Intro - 3 seconds]
(${form.groove}; ${normalizedInstruments(form).slice(0, 4).join(", ")} enters with a clear motif)

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
  const genres = normalizedGenres(form).slice(0, 4).join(", ");
  const singerTerms = singers.flatMap((singer) => singer.safePromptTerms).slice(0, 2).join(", ");
  const instruments = normalizedInstruments(form).slice(0, 4).join(", ");
  const prompt = `${genres}, ${form.primaryEmotion} song, ${singerTerms}, ${instruments}, ${form.groove}, ${form.key}, hook-driven chorus, clean modern production-ready mix`;
  return trimPrompt(sanitizeForbidden(prompt, singers), 250);
}

function buildCompositionPrompt(form: SongForm, singers: SingerProfile[]) {
  const instruments = normalizedInstruments(form).slice(0, 6).join(", ");
  const prompt = `Start with a concise motif, build around ${instruments}, keep verses lean, lift the pre-chorus, make the chorus repeatable, use ${form.groove}, ${form.key}, then drop into a bridge before a fuller final chorus and clean outro.`;
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

function auditLyrics(lyrics: string, stylePrompt: string, compositionPrompt: string, singers: SingerProfile[]): AuditResult {
  const items: AuditItem[] = [];
  const joined = `${lyrics}\n${stylePrompt}\n${compositionPrompt}`;
  const forbidden = singers.flatMap((singer) => singer.forbiddenOutputTerms).filter(Boolean);

  for (const term of forbidden) {
    if (new RegExp(escapeRegExp(term), "i").test(joined)) {
      items.push({
        type: "artist_name_misuse",
        severity: "high",
        message: `Output contains a forbidden reference artist term: ${term}.`,
        suggestion: "Replace it with neutral vocal descriptors such as male vocal, female vocal, duet, harmony, or rap vocal.",
      });
    }
  }

  if (/\b(she said|he said|i said|they said|told me|mama said|mother said)\b/i.test(lyrics)) {
    items.push({
      type: "quoted_or_dialogue_lyric",
      severity: "medium",
      message: "Lyrics contain dialogue-style quoted speech.",
      suggestion: "Rewrite as inner monologue or image-based narration instead of direct said/told phrasing.",
    });
  }

  if (stylePrompt.length > 250) {
    items.push({
      type: "style_prompt_length",
      severity: "medium",
      message: "Style Prompt is longer than the recommended hard limit.",
      suggestion: "Reduce genre, vocal, instrument, and mix descriptors to the strongest terms.",
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
