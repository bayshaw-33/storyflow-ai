"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { KiikisLogo } from "@/components/brand/KiikisLogo";
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
type LyricsMode = "suno_enhanced" | "plain_lyrics" | "no_tags";
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
  { value: "original_song", label: "原创歌曲", labelEn: "Original song", strategy: "standard Suno structure" },
  { value: "short_video_song", label: "短视频歌曲", labelEn: "Short-video song", strategy: "front-loaded hook" },
  { value: "ost_theme", label: "OST / 主题曲", labelEn: "OST / theme", strategy: "cinematic narrative lift" },
  { value: "bgm_mood", label: "BGM / 氛围音乐", labelEn: "BGM / mood music", strategy: "lighter lyrics, stronger arrangement" },
  { value: "character_song", label: "角色歌曲", labelEn: "Character song", strategy: "inner monologue and conflict" },
  { value: "brand_song", label: "广告 / 品牌歌曲", labelEn: "Brand song", strategy: "clear, safe, memorable" },
  { value: "game_anime_song", label: "游戏 / 动漫歌曲", labelEn: "Game / anime song", strategy: "world, mission, destiny" },
  { value: "duet_song", label: "合唱 / 对唱歌曲", labelEn: "Duet / ensemble", strategy: "multi-vocal section split" },
  { value: "series_song", label: "系列歌曲", labelEn: "Series song", strategy: "repeatable versions" },
];

const primaryEmotionMap: Record<string, string[]> = {
  "快乐 / 轻松": ["明亮", "自由", "俏皮", "阳光", "轻快", "庆祝感"],
  "悲伤 / 遗憾": ["怀念", "失落", "克制", "释怀", "心碎", "温柔", "孤独"],
  "浪漫 / 甜蜜": ["心动", "暧昧", "柔软", "梦幻", "亲密", "温柔"],
  "愤怒 / 反击": ["叛逆", "压抑", "爆发", "冷酷", "胜利感", "危险感", "不甘"],
  "黑暗 / 神秘": ["危险感", "迷离", "冷感", "压迫感", "性感", "复仇感", "宿命感"],
  "治愈 / 温暖": ["释怀", "安静", "希望", "陪伴感", "柔和", "明亮"],
  "燃 / 胜利": ["高能", "宣言感", "荣耀感", "反击", "释放", "大合唱感"],
  "孤独 / 空旷": ["冷清", "失重感", "夜晚感", "疏离", "空灵", "克制"],
  "性感 / 迷离": ["暧昧", "低频", "危险感", "夜晚感", "柔软", "神秘"],
  "讽刺 / 荒诞": ["幽默", "疲惫", "自嘲", "怪诞", "松弛", "丧感", "反差感"],
  "史诗 / 宿命": ["宏大", "悲壮", "神圣感", "命运感", "战争感", "终章感"],
};

const genreOptions = [
  "Pop",
  "R&B",
  "Hip-hop",
  "Trap",
  "EDM",
  "House",
  "Synth-pop",
  "Indie Pop",
  "Alt-pop",
  "Rock",
  "Pop Rock",
  "Folk Pop",
  "Country",
  "Ballad",
  "Lo-fi",
  "City Pop",
  "Afrobeats",
  "Latin Pop",
  "K-pop",
  "J-pop",
  "Cinematic",
  "Musical",
  "Gospel",
  "Soul",
  "Reggae",
  "Dancehall",
  "Synthwave",
  "Dark Pop",
  "Hyperpop",
];

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
const instrumentOptions = ["piano", "electric piano", "Rhodes", "acoustic guitar", "clean electric guitar", "distorted electric guitar", "reggae offbeat guitar", "808 bass", "synth bass", "warm bass guitar", "fuzzy bassline", "soft drums", "trap drums", "lo-fi drums", "live drums", "strings", "choir", "pads", "ambient textures", "vinyl noise", "analog synth", "arpeggiator", "glitch effects", "vocoder"];
const structureOptions = ["Standard Suno song structure", "Short-video hook first", "OST gradual build", "BGM light-lyrics structure", "Rap + Chorus structure", "Duet structure", "Ensemble structure"];

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

const initialForm: SongForm = {
  title: "",
  projectType: "original_song",
  outputLanguage: "English",
  customLanguage: "",
  concept: "",
  primaryEmotion: "讽刺 / 荒诞",
  secondaryEmotions: ["疲惫", "自嘲", "幽默"],
  genres: ["Lo-fi", "Indie Pop", "Pop Rock"],
  customGenre: "",
  selectedSingerIds: ["dry-sarcastic-male"],
  groove: "mid-tempo pop, 76-95 BPM",
  key: "G minor",
  instruments: ["electric piano", "fuzzy bassline", "lo-fi drums"],
  customInstrument: "",
  structure: "Standard Suno song structure",
  lyricsMode: "suno_enhanced",
};

const i18n = {
  "en-US": {
    title: "Song Creation Workbench",
    subtitle: "Create Suno-ready lyrics, style prompts, and arrangement prompts. No audio generation or Suno account connection.",
    setup: "Project setup",
    singerLibrary: "Singer library",
    advanced: "Advanced music settings",
    outputs: "Outputs",
    audit: "Lyrics audit",
    revision: "Revision",
    history: "Version history",
    titleField: "Project title",
    projectType: "Project type",
    outputLanguage: "Output language",
    concept: "Song concept",
    primaryEmotion: "Primary emotion",
    secondaryEmotion: "Secondary emotions",
    genres: "Target genres",
    singers: "Singer tags",
    generate: "Generate workbench text",
    generating: "Generating",
    saveVersion: "Save version",
    copy: "Copy",
    copied: "Copied.",
    lyrics: "Suno Lyrics",
    stylePrompt: "Style Prompt",
    compositionPrompt: "Composition Prompt",
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
    title: "歌曲创作工作流",
    subtitle: "生成可复制到 Suno 的歌词、风格提示词和编曲提示词。不生成音频，也不连接 Suno 账号。",
    setup: "项目基础信息",
    singerLibrary: "歌手库",
    advanced: "高级音乐设定",
    outputs: "输出区",
    audit: "歌词审查",
    revision: "修改指令",
    history: "版本历史",
    titleField: "项目标题",
    projectType: "项目类型",
    outputLanguage: "输出语言",
    concept: "歌曲概念",
    primaryEmotion: "主情绪",
    secondaryEmotion: "辅助情绪",
    genres: "目标曲风",
    singers: "歌手标签",
    generate: "生成工作流文本",
    generating: "生成中",
    saveVersion: "保存版本",
    copy: "复制",
    copied: "已复制。",
    lyrics: "Suno Lyrics",
    stylePrompt: "Style Prompt",
    compositionPrompt: "Composition Prompt",
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
  const { locale } = useI18n();
  const text = i18n[locale];
  const [form, setForm] = useState<SongForm>(initialForm);
  const [singers, setSingers] = useState<SingerProfile[]>(defaultSingers);
  const [lyrics, setLyrics] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [compositionPrompt, setCompositionPrompt] = useState("");
  const [audit, setAudit] = useState<AuditResult | null>(null);
  const [versions, setVersions] = useState<SongVersion[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [manualSinger, setManualSinger] = useState("");
  const [referenceArtist, setReferenceArtist] = useState("");
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [revisionScope, setRevisionScope] = useState("Auto");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    void supabase?.auth.getSession().then(({ data }) => setSession(data.session || null));
    const { data: listener } =
      supabase?.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession)) || {};

    return () => listener?.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (!stored) return;
      const data = JSON.parse(stored);
      if (data.form) setForm(data.form);
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
    () => singers.filter((singer) => form.selectedSingerIds.includes(singer.id)),
    [form.selectedSingerIds, singers],
  );

  const secondaryOptions = primaryEmotionMap[form.primaryEmotion] || [];
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
    setNotice("");
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
      saveVersion("AI generation", "Generated Suno lyrics and prompts through AI.", nextLyrics, nextStylePrompt, nextCompositionPrompt, nextAudit.status);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : "AI generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  function saveVersion(changeType = "Manual save", summary = "Saved current workbench state.", nextLyrics = lyrics, nextStyle = stylePrompt, nextComposition = compositionPrompt, nextStatus = audit?.status || "pass") {
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
  }

  function addManualSinger() {
    const name = manualSinger.trim();
    if (!name) return;
    const singer = createManualSinger(name);
    setSingers((current) => [...current, singer]);
    setForm((current) => ({ ...current, selectedSingerIds: [...current.selectedSingerIds, singer.id] }));
    setManualSinger("");
  }

  function addReferenceSinger() {
    const reference = referenceArtist.trim();
    if (!reference) return;
    const singer = createReferenceSinger(reference);
    setSingers((current) => [...current, singer]);
    setForm((current) => ({ ...current, selectedSingerIds: [...current.selectedSingerIds, singer.id] }));
    setReferenceArtist("");
  }

  function runAudit() {
    const nextAudit = auditLyrics(lyrics, stylePrompt, compositionPrompt, selectedSingers);
    setAudit(nextAudit);
  }

  function applyRevision() {
    const instruction = revisionInstruction.trim();
    if (!instruction || !lyrics.trim()) return;
    const nextLyrics = reviseLyrics(lyrics, instruction, revisionScope);
    const nextAudit = auditLyrics(nextLyrics, stylePrompt, compositionPrompt, selectedSingers);
    setLyrics(nextLyrics);
    setAudit(nextAudit);
    setRevisionInstruction("");
    saveVersion("Revision", `${revisionScope}: ${instruction}`, nextLyrics, stylePrompt, compositionPrompt, nextAudit.status);
  }

  async function copyText(value: string, guarded = false) {
    setNotice("");
    if (guarded && !canCopyLyrics) {
      setError("High-risk lyrics must be revised before copying.");
      return;
    }
    await navigator.clipboard.writeText(value);
    setNotice(text.copied);
  }

  function restoreVersion(version: SongVersion) {
    setLyrics(version.lyrics);
    setStylePrompt(version.stylePrompt);
    setCompositionPrompt(version.compositionPrompt);
    setAudit(auditLyrics(version.lyrics, version.stylePrompt, version.compositionPrompt, selectedSingers));
    saveVersion("Restore", `Restored version ${version.versionNumber}.`, version.lyrics, version.stylePrompt, version.compositionPrompt, version.auditStatus);
  }

  return (
    <main className="cosmic-page">
      <header className="cosmic-page-header">
        <Link href="/dashboard" aria-label="Dashboard"><KiikisLogo compact /></Link>
        <div className="nav-actions">
          <Link className="secondary-button" href="/dashboard">Dashboard</Link>
        </div>
      </header>

      <section className="cosmic-title-band">
        <span>Suno Text Workflow</span>
        <h1>{text.title}</h1>
        <p>{text.subtitle}</p>
      </section>

      <section className="app-shell song-workbench-shell">
        {error ? <div className="notice error">{error}</div> : null}
        {notice ? <div className="notice success">{notice}</div> : null}

        <form className="dashboard-panel" onSubmit={generateAll}>
          <div className="dashboard-panel-head">
            <div>
              <span>{text.setup}</span>
              <h2>{form.title || "Untitled song project"}</h2>
            </div>
            <button className="primary-button" type="submit" disabled={generating}>
              {generating ? text.generating : text.generate}
            </button>
          </div>

          <div className="wizard-grid">
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
                {Object.keys(primaryEmotionMap).map((option) => <option key={option}>{option}</option>)}
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

          <fieldset className="settings-card">
            <span>{text.secondaryEmotion}</span>
            <div className="workflow-template-meta">
              {secondaryOptions.map((option) => (
                <label key={option}>
                  <input
                    type="checkbox"
                    checked={form.secondaryEmotions.includes(option)}
                    onChange={() => toggleListValue("secondaryEmotions", option)}
                  />
                  {option}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="settings-card">
            <span>{text.genres}</span>
            <div className="workflow-template-meta">
              {genreOptions.map((option) => (
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
            <input
              value={form.customGenre}
              onChange={(event) => updateForm("customGenre", event.target.value)}
              placeholder="Custom genre tags, comma separated"
            />
          </fieldset>
        </form>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.singerLibrary}</span>
              <h2>{text.singers}</h2>
            </div>
          </div>
          <div className="workflow-template-grid">
            {singers.map((singer) => (
              <article className="workflow-template-card" key={singer.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={form.selectedSingerIds.includes(singer.id)}
                    onChange={() => toggleListValue("selectedSingerIds", singer.id)}
                  />
                  <strong>{singer.displayName}</strong>
                </label>
                <p>{singer.safePromptTerms.join(", ")}</p>
                <div className="workflow-template-meta">
                  {singer.genres.slice(0, 3).map((item) => <span key={item}>{item}</span>)}
                </div>
              </article>
            ))}
          </div>
          <div className="wizard-grid">
            <label>
              {text.createSinger}
              <input value={manualSinger} onChange={(event) => setManualSinger(event.target.value)} placeholder="Warm Female Vocal" />
              <button className="secondary-button" type="button" onClick={addManualSinger}>{text.add}</button>
            </label>
            <label>
              {text.fromReference}
              <input value={referenceArtist} onChange={(event) => setReferenceArtist(event.target.value)} placeholder={text.referencePlaceholder} />
              <button className="secondary-button" type="button" onClick={addReferenceSinger}>{text.add}</button>
            </label>
          </div>
        </section>

        <section className="dashboard-panel song-output-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.advanced}</span>
              <h2>Groove, key, instruments, structure</h2>
            </div>
          </div>
          <div className="wizard-grid">
            <label>
              Groove
              <select value={form.groove} onChange={(event) => updateForm("groove", event.target.value)}>
                {grooveOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Key
              <select value={form.key} onChange={(event) => updateForm("key", event.target.value)}>
                {keyOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Lyrics structure
              <select value={form.structure} onChange={(event) => updateForm("structure", event.target.value)}>
                {structureOptions.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
            <label>
              Lyrics output mode
              <select value={form.lyricsMode} onChange={(event) => updateForm("lyricsMode", event.target.value as LyricsMode)}>
                <option value="suno_enhanced">Suno enhanced lyrics</option>
                <option value="plain_lyrics">Plain lyrics with section tags</option>
                <option value="no_tags">Lyrics only, no tags</option>
              </select>
            </label>
          </div>
          <fieldset className="settings-card">
            <span>Instruments / arrangement elements</span>
            <div className="workflow-template-meta">
              {instrumentOptions.map((option) => (
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
            <input
              value={form.customInstrument}
              onChange={(event) => updateForm("customInstrument", event.target.value)}
              placeholder="Custom instruments, comma separated"
            />
          </fieldset>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.outputs}</span>
              <h2>{text.lyrics}</h2>
            </div>
            <div className="nav-actions">
              <button className="secondary-button" type="button" onClick={runAudit}>{text.audit}</button>
              <button className="primary-button" type="button" disabled={!lyrics || !canCopyLyrics} onClick={() => copyText(lyrics, true)}>{text.copy}</button>
            </div>
          </div>
          <textarea className="song-lyrics-textarea" value={lyrics} onChange={(event) => setLyrics(event.target.value)} placeholder="[Intro - 3 seconds]..." />
        </section>

        <section className="workflow-template-grid song-prompt-grid">
          <article className="workflow-template-card song-prompt-card">
            <h3>{text.stylePrompt}</h3>
            <p>{stylePrompt.length} characters</p>
            <textarea className="song-prompt-textarea" value={stylePrompt} onChange={(event) => setStylePrompt(event.target.value)} />
            <button className="secondary-button" type="button" onClick={() => copyText(stylePrompt)}>{text.copy}</button>
          </article>
          <article className="workflow-template-card song-prompt-card">
            <h3>{text.compositionPrompt}</h3>
            <p>{compositionPrompt.length} characters</p>
            <textarea className="song-prompt-textarea" value={compositionPrompt} onChange={(event) => setCompositionPrompt(event.target.value)} />
            <button className="secondary-button" type="button" onClick={() => copyText(compositionPrompt)}>{text.copy}</button>
          </article>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.audit}</span>
              <h2>{audit ? audit.status : text.auditPass}</h2>
            </div>
          </div>
          {audit ? (
            <div className="settings-list">
              <div className={`notice ${audit.status === "high_risk" ? "error" : audit.status === "medium_risk" ? "warning" : "success"}`}>
                {audit.allowCopy ? "Copy allowed." : "Copy blocked until high-risk items are revised."}
              </div>
              {audit.items.length === 0 ? <p className="subtle">No risk items found.</p> : null}
              {audit.items.map((item) => (
                <article className="settings-card" key={`${item.type}-${item.message}`}>
                  <span>{item.severity} / {item.type}</span>
                  <p>{item.message}</p>
                  <p>{item.suggestion}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.revision}</span>
              <h2>Preserve unchanged sections by default</h2>
            </div>
            <button className="primary-button" type="button" onClick={applyRevision}>{text.revise}</button>
          </div>
          <div className="wizard-grid">
            <label>
              Scope
              <select value={revisionScope} onChange={(event) => setRevisionScope(event.target.value)}>
                {["Auto", "Intro", "Verse 1", "Pre-Chorus", "Chorus", "Verse 2", "Bridge", "Final Chorus", "Outro", "Style Prompt only", "Composition Prompt only", "Full text micro-adjust"].map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              Instruction
              <textarea className="song-revision-textarea" value={revisionInstruction} onChange={(event) => setRevisionInstruction(event.target.value)} placeholder={text.revisionPlaceholder} />
            </label>
          </div>
        </section>

        <section className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <span>{text.history}</span>
              <h2>{versions.length} versions</h2>
            </div>
            <button className="secondary-button" type="button" onClick={() => saveVersion()}>{text.saveVersion}</button>
          </div>
          <div className="settings-list">
            {versions.length === 0 ? <p className="subtle">{text.noVersions}</p> : null}
            {versions.map((version) => (
              <article className="settings-card" key={version.id}>
                <span>v{version.versionNumber} / {version.auditStatus}</span>
                <h3>{version.changeType}</h3>
                <p>{version.summary}</p>
                <p>{new Date(version.createdAt).toLocaleString()}</p>
                <button className="secondary-button" type="button" onClick={() => restoreVersion(version)}>Restore</button>
              </article>
            ))}
          </div>
        </section>
      </section>
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

function parseSongGeneration(output: string) {
  const section = (name: string) => {
    const pattern = new RegExp(`---${name}---\\s*([\\s\\S]*?)(?=\\n---[A-Z_]+---|$)`, "i");
    return output.match(pattern)?.[1]?.trim() || "";
  };

  const lyrics = section("LYRICS") || output.match(/(?:^|\n)#+\s*(?:lyrics|suno lyrics|歌词)\s*\n([\s\S]*?)(?=\n#+\s*|$)/i)?.[1]?.trim() || "";
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

function createManualSinger(name: string): SingerProfile {
  const safeName = name.replace(/[^\w\s-]/g, "").trim() || "Custom Vocal";
  return {
    id: `manual-${Date.now()}`,
    displayName: safeName,
    gender: "custom",
    genres: ["custom"],
    voiceTexture: ["custom"],
    delivery: ["custom delivery"],
    language: ["Custom"],
    safePromptTerms: [`${safeName.toLowerCase()} vocal`.replace(/\s+/g, " ")],
    forbiddenOutputTerms: [],
    notes: "Manual singer tag.",
  };
}

function createReferenceSinger(referenceArtist: string): SingerProfile {
  const forbidden = referenceArtist.replace(/[^\w\s-]/g, "").trim();
  return {
    id: `reference-${Date.now()}`,
    displayName: "Safe Reference Vocal",
    gender: "custom",
    genres: ["pop", "R&B", "melodic"],
    voiceTexture: ["smooth", "bright", "rhythmic"],
    delivery: ["melodic phrasing", "hook-driven delivery", "rhythmic vocal"],
    language: ["English"],
    safePromptTerms: ["smooth melodic vocal", "catchy hook-driven phrasing", "rhythmic emotional delivery"],
    forbiddenOutputTerms: forbidden ? [forbidden] : [],
    notes: `Internal reference only: ${forbidden || "unknown"}. Do not output this name.`,
  };
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
  const prompt = `${genres}, ${form.primaryEmotion} song, ${singerTerms}, ${instruments}, ${form.groove}, ${form.key}, hook-driven chorus, clean modern Suno-ready mix`;
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
  if (form.primaryEmotion.includes("燃")) return `${form.title || "Tonight"}, we rise again`;
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

  if (compositionPrompt.length > 350) {
    items.push({
      type: "composition_prompt_length",
      severity: "low",
      message: "Composition Prompt is longer than recommended.",
      suggestion: "Keep only intro, groove, instruments, section movement, and outro.",
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

function reviseLyrics(lyrics: string, instruction: string, scope: string) {
  const note = `(Revision note: ${instruction})`;
  if (scope === "Style Prompt only" || scope === "Composition Prompt only") return lyrics;
  if (scope === "Auto" || scope === "Full text micro-adjust") return `${lyrics.trim()}\n\n[Revision Direction]\n${note}`;

  const sectionPattern = new RegExp(`(\\[${escapeRegExp(scope)}[^\\]]*\\]\\n)([\\s\\S]*?)(?=\\n\\[[^\\]]+\\]|$)`, "i");
  if (!sectionPattern.test(lyrics)) return `${lyrics.trim()}\n\n[${scope} Revision]\n${note}`;
  return lyrics.replace(sectionPattern, (_match, heading, body) => `${heading}${body.trim()}\n${note}\n`);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
