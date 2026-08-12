"use client";

// K2-T-03 渐进式项目创建 · 主流程组件
// 不要求先填写完整 Universe，后续参数按需在工作台内补充。

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lightbulb,
  FileText,
  Boxes,
  Clapperboard,
  BookOpen,
  Music,
  LayoutGrid,
  Video,
  Search,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Users,
  ScrollText,
  Activity,
  AlertCircle,
  RefreshCw,
} from "lucide-react";

import { useI18n } from "@/lib/i18n/useI18n";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchUniverseOptions, createProject } from "@/lib/client/v2/project-start/api";
import { filterUniverseOptions, buildProjectStartRequest } from "@/lib/client/v2/project-start/helpers";
import type {
  ContentType,
  StartMode,
  UniverseAction,
  UniverseOption,
} from "@/lib/client/v2/project-start/types";

import styles from "./ProjectStartFlow.module.css";

type Step = "entry" | "content-type" | "title" | "universe" | "confirm";

interface EntryCardConfig {
  mode: StartMode;
  icon: typeof Lightbulb;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
}

const ENTRY_CARDS: EntryCardConfig[] = [
  {
    mode: "idea",
    icon: Lightbulb,
    titleZh: "从想法开始",
    titleEn: "Start from an idea",
    descZh: "一句话灵感也能启动。先建项目，再慢慢长出世界与剧本。",
    descEn: "One sentence is enough. Start the project, grow the world later.",
  },
  {
    mode: "script",
    icon: FileText,
    titleZh: "从剧本开始",
    titleEn: "Start from a script",
    descZh: "已有大纲或成稿剧本，导入后直接进入工作台继续打磨。",
    descEn: "Import an outline or finished script, continue in the workbench.",
  },
  {
    mode: "material",
    icon: Boxes,
    titleZh: "从素材开始",
    titleEn: "Start from materials",
    descZh: "角色卡、世界观片段、参考视频，任何素材都能作为起点。",
    descEn: "Character cards, world notes, reference clips — any material works.",
  },
];

interface ContentTypeConfig {
  type: ContentType;
  icon: typeof Clapperboard;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  route: string;
}

const CONTENT_TYPES: ContentTypeConfig[] = [
  {
    type: "drama",
    icon: Clapperboard,
    titleZh: "短剧",
    titleEn: "Short drama",
    descZh: "竖屏短剧、分集钩子、可直接投产的剧本。",
    descEn: "Vertical short drama, episode hooks, production-ready scripts.",
    route: "/novel-workbench",
  },
  {
    type: "novel",
    icon: BookOpen,
    titleZh: "小说",
    titleEn: "Novel",
    descZh: "长篇故事线、章节与连载叙事。",
    descEn: "Long-form story arcs, chapters, serialized narrative.",
    route: "/novel-workbench",
  },
  {
    type: "song",
    icon: Music,
    titleZh: "歌曲",
    titleEn: "Song",
    descZh: "歌词、编曲概念、人声与多语言版本。",
    descEn: "Lyrics, arrangement concepts, vocals and multilingual versions.",
    route: "/song-workbench",
  },
  {
    type: "storyboard",
    icon: LayoutGrid,
    titleZh: "分镜",
    titleEn: "Storyboard",
    descZh: "场景分镜、镜头语言、视觉规划与投产衔接。",
    descEn: "Scene storyboards, shot language, visual planning.",
    route: "/production?mode=planning",
  },
  {
    type: "video",
    icon: Video,
    titleZh: "视频",
    titleEn: "Video",
    descZh: "直接进入剪辑台，组合素材、生成片段、导出成片。",
    descEn: "Jump into the editor, assemble clips, export the final cut.",
    route: "/production?mode=editor",
  },
];

const UNIVERSE_ACTIONS: {
  action: UniverseAction;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
}[] = [
  {
    action: "create_new",
    titleZh: "新建 Universe",
    titleEn: "Create new universe",
    descZh: "创建一个空白 Universe 并自动绑定到这个项目。",
    descEn: "Create a blank universe and bind it to this project.",
  },
  {
    action: "bind_existing",
    titleZh: "绑定已有",
    titleEn: "Bind existing",
    descZh: "从你已有的 Universe 中搜索并选择一个。",
    descEn: "Search and pick from your existing universes.",
  },
  {
    action: "skip",
    titleZh: "暂不绑定",
    titleEn: "Skip for now",
    descZh: "后续随时可在工作台内绑定，项目会标记为 unbound。",
    descEn: "Bind later in the workbench anytime. Project stays unbound.",
  },
];

function healthClass(score: number): string {
  if (score >= 80) return styles.healthHigh;
  if (score >= 65) return styles.healthMid;
  return styles.healthLow;
}

function healthLabelZh(score: number): string {
  if (score >= 80) return "健康";
  if (score >= 65) return "注意";
  return "需维护";
}

function formatLastActivity(iso: string, isZh: boolean): string {
  try {
    const then = new Date(iso).getTime();
    const now = Date.now();
    const diffMs = now - then;
    const diffDay = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDay <= 0) return isZh ? "今天" : "today";
    if (diffDay === 1) return isZh ? "昨天" : "yesterday";
    if (diffDay < 30) return isZh ? `${diffDay} 天前` : `${diffDay} days ago`;
    const diffMonth = Math.floor(diffDay / 30);
    return isZh ? `${diffMonth} 个月前` : `${diffMonth} months ago`;
  } catch {
    return iso;
  }
}

export function ProjectStartFlow() {
  const router = useRouter();
  const { locale } = useI18n();
  const isZh = locale === "zh-CN";

  // 认证状态
  const [authChecked, setAuthChecked] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // 流程状态
  const [step, setStep] = useState<Step>("entry");
  const [startMode, setStartMode] = useState<StartMode | null>(null);
  const [contentType, setContentType] = useState<ContentType | null>(null);
  const [title, setTitle] = useState("");
  const [universeAction, setUniverseAction] = useState<UniverseAction | null>(null);
  const [universeId, setUniverseId] = useState<string | undefined>(undefined);
  const [universeQuery, setUniverseQuery] = useState("");
  const [expandedUniverseId, setExpandedUniverseId] = useState<string | null>(null);

  // Universe 列表状态
  const [universes, setUniverses] = useState<UniverseOption[]>([]);
  const [universesLoading, setUniversesLoading] = useState(false);
  const [universesError, setUniversesError] = useState<string | null>(null);

  // 提交状态
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // 认证检查
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      // 无 Supabase 配置时仍允许以 fixture 模式预览
      setAuthChecked(true);
      setIsLoggedIn(true);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setIsLoggedIn(!!data.session);
      setAuthChecked(true);
    });
  }, []);

  // 未登录跳转
  useEffect(() => {
    if (authChecked && !isLoggedIn) {
      router.replace("/login");
    }
  }, [authChecked, isLoggedIn, router]);

  // 加载 Universe 列表
  const loadUniverses = useCallback(async () => {
    setUniversesLoading(true);
    setUniversesError(null);
    try {
      const options = await fetchUniverseOptions();
      setUniverses(options);
    } catch (err) {
      setUniversesError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setUniversesLoading(false);
    }
  }, []);

  const filteredUniverses = useMemo(
    () => filterUniverseOptions(universes, universeQuery),
    [universes, universeQuery],
  );

  function handleEntrySelect(mode: StartMode) {
    setStartMode(mode);
    setStep("content-type");
  }

  function handleContentTypeSelect(type: ContentType) {
    setContentType(type);
    setStep("title");
  }

  function handleUniverseActionSelect(action: UniverseAction) {
    setUniverseAction(action);
    setUniverseId(undefined);
    setExpandedUniverseId(null);
    setUniverseQuery("");
    if (action === "bind_existing") {
      void loadUniverses();
    }
  }

  function handleBack() {
    setSubmitError(null);
    switch (step) {
      case "content-type":
        setStep("entry");
        setStartMode(null);
        break;
      case "title":
        setStep("content-type");
        setContentType(null);
        break;
      case "universe":
        setStep("title");
        break;
      case "confirm":
        setStep("universe");
        break;
    }
  }

  function canAdvance(): boolean {
    switch (step) {
      case "content-type":
        return contentType !== null;
      case "title":
        return title.trim().length > 0;
      case "universe":
        if (universeAction === null) return false;
        if (universeAction === "bind_existing") return !!universeId;
        return true;
      case "confirm":
        return !submitting;
      default:
        return false;
    }
  }

  function handleNext() {
    if (!canAdvance()) return;
    setSubmitError(null);
    switch (step) {
      case "content-type":
        if (contentType) setStep("title");
        break;
      case "title":
        setStep("universe");
        break;
      case "universe":
        setStep("confirm");
        break;
      case "confirm":
        void handleSubmit();
        break;
    }
  }

  async function handleSubmit() {
    if (!contentType || !startMode || !universeAction) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const request = buildProjectStartRequest({
        contentType,
        startMode,
        title,
        universeAction,
        universeId,
      });
      const response = await createProject(request);
      router.push(response.workbenchRoute);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "unknown error");
    } finally {
      setSubmitting(false);
    }
  }

  // 全屏加载态（认证检查中）
  if (!authChecked) {
    return (
      <div className={styles.fullscreenState}>
        <div className={styles.spinner} />
      </div>
    );
  }

  // 未登录态
  if (!isLoggedIn) {
    return (
      <div className={styles.fullscreenState}>
        <p>{isZh ? "正在跳转登录…" : "Redirecting to login…"}</p>
      </div>
    );
  }

  const stepOrder: Step[] = ["content-type", "title", "universe", "confirm"];
  const stepLabelsZh = ["内容类型", "标题", "Universe", "确认"];
  const stepLabelsEn = ["Content type", "Title", "Universe", "Confirm"];
  const currentStepIndex = stepOrder.indexOf(step);

  return (
    <main className={styles.shell}>
      <div className={styles.container}>
        {/* 顶部标题 */}
        <header className={styles.header}>
          <p className={styles.headerKicker}>
            {isZh ? "K2 · 渐进式项目创建" : "K2 · Progressive project start"}
          </p>
          <h1 className={styles.headerTitle}>
            {isZh ? "开始一个新项目" : "Start a new project"}
          </h1>
          <p className={styles.headerSubtitle}>
            {isZh
              ? "只需回答几个关键问题就能进入工作台。集数、语言、生产参数可以后续按需补充。"
              : "Answer a few key questions to enter the workbench. Episodes, language, and production params can be filled in later."}
          </p>
        </header>

        {/* 步骤指示器 */}
        {step !== "entry" && (
          <div className={styles.stepper}>
            {stepOrder.map((s, i) => {
              const isDone = i < currentStepIndex;
              const isActive = i === currentStepIndex;
              const cls = isActive
                ? `${styles.stepDot} ${styles.stepDotActive}`
                : isDone
                  ? `${styles.stepDot} ${styles.stepDotDone}`
                  : styles.stepDot;
              return (
                <div key={s} style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                  <span className={cls}>
                    {isDone ? "✓" : i + 1} {isZh ? stepLabelsZh[i] : stepLabelsEn[i]}
                  </span>
                  {i < stepOrder.length - 1 && <span className={styles.stepConnector} />}
                </div>
              );
            })}
          </div>
        )}

        {/* 入口：三种开始方式 */}
        {step === "entry" && (
          <section>
            <div className={styles.entryGrid}>
              {ENTRY_CARDS.map((card) => {
                const Icon = card.icon;
                return (
                  <button
                    key={card.mode}
                    type="button"
                    className={styles.entryCard}
                    onClick={() => handleEntrySelect(card.mode)}
                  >
                    <span className={styles.entryCardIcon}>
                      <Icon size={20} />
                    </span>
                    <h3 className={styles.entryCardTitle}>
                      {isZh ? card.titleZh : card.titleEn}
                    </h3>
                    <p className={styles.entryCardDesc}>
                      {isZh ? card.descZh : card.descEn}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 第 1 步：内容类型 */}
        {step === "content-type" && (
          <section>
            <h2 className={styles.stepTitle}>
              {isZh ? "想做什么？" : "What do you want to make?"}
            </h2>
            <p className={styles.stepHint}>
              {isZh
                ? "选择内容类型，决定创建后进入哪个工作台。"
                : "Pick a content type — this decides which workbench you'll enter."}
            </p>
            <div className={styles.optionGrid}>
              {CONTENT_TYPES.map((ct) => {
                const Icon = ct.icon;
                const selected = contentType === ct.type;
                return (
                  <button
                    key={ct.type}
                    type="button"
                    className={`${styles.optionCard} ${selected ? styles.optionCardSelected : ""}`}
                    onClick={() => setContentType(ct.type)}
                  >
                    <span className={styles.optionCardIcon}>
                      <Icon size={18} />
                    </span>
                    <h3 className={styles.optionCardTitle}>
                      {isZh ? ct.titleZh : ct.titleEn}
                    </h3>
                    <p className={styles.optionCardDesc}>
                      {isZh ? ct.descZh : ct.descEn}
                    </p>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* 第 2 步：确认开始方式 + 标题 */}
        {step === "title" && (
          <section>
            <h2 className={styles.stepTitle}>
              {isZh ? "给项目起个名字" : "Name your project"}
            </h2>
            <p className={styles.stepHint}>
              {isZh
                ? "开始方式已由入口确定，可在此确认。标题可以后续修改。"
                : "Start mode is set from your entry choice. Title can be changed later."}
            </p>
            {startMode && (
              <div className={styles.startModeBadge}>
                {(() => {
                  const card = ENTRY_CARDS.find((c) => c.mode === startMode);
                  return card ? (isZh ? card.titleZh : card.titleEn) : startMode;
                })()}
              </div>
            )}
            <input
              type="text"
              className={styles.titleInput}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={isZh ? "例如：霓虹之夜第一季" : "e.g. Neon Night Season 1"}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && canAdvance()) handleNext();
              }}
            />
          </section>
        )}

        {/* 第 3 步：Universe 关联 */}
        {step === "universe" && (
          <section>
            <h2 className={styles.stepTitle}>
              {isZh ? "关联 Universe 吗？" : "Link a universe?"}
            </h2>
            <p className={styles.stepHint}>
              {isZh
                ? "Universe 是角色、世界规则与关系网的容器。可以现在绑定，也可以稍后在工作中绑定。"
                : "A universe holds characters, world rules and relationships. Bind now or later."}
            </p>

            <div className={styles.universeActions}>
              {UNIVERSE_ACTIONS.map((ua) => {
                const selected = universeAction === ua.action;
                return (
                  <button
                    key={ua.action}
                    type="button"
                    className={`${styles.universeActionCard} ${selected ? styles.universeActionCardSelected : ""}`}
                    onClick={() => handleUniverseActionSelect(ua.action)}
                  >
                    <h3 className={styles.universeActionTitle}>
                      {isZh ? ua.titleZh : ua.titleEn}
                    </h3>
                    <p className={styles.universeActionDesc}>
                      {isZh ? ua.descZh : ua.descEn}
                    </p>
                  </button>
                );
              })}
            </div>

            {/* 绑定已有：搜索 + 列表 */}
            {universeAction === "bind_existing" && (
              <div>
                <div className={styles.searchBox}>
                  <Search size={16} className={styles.searchIcon} />
                  <input
                    type="text"
                    className={styles.searchInput}
                    value={universeQuery}
                    onChange={(e) => setUniverseQuery(e.target.value)}
                    placeholder={isZh ? "搜索 Universe 名称或摘要…" : "Search universe name or summary…"}
                  />
                </div>

                {/* 加载中 */}
                {universesLoading && (
                  <div className={styles.stateBlock}>
                    <div className={styles.spinner} />
                    <p className={styles.stateText}>
                      {isZh ? "正在加载 Universe 列表…" : "Loading universes…"}
                    </p>
                  </div>
                )}

                {/* 错误 */}
                {universesError && !universesLoading && (
                  <div className={styles.stateBlock}>
                    <AlertCircle size={24} color="#ff6b6b" />
                    <p className={styles.stateTitle}>
                      {isZh ? "加载失败" : "Failed to load"}
                    </p>
                    <p className={styles.stateText}>{universesError}</p>
                    <button
                      type="button"
                      className={styles.retryBtn}
                      onClick={() => void loadUniverses()}
                    >
                      <RefreshCw size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
                      {isZh ? "重试" : "Retry"}
                    </button>
                  </div>
                )}

                {/* 空数据 */}
                {!universesLoading && !universesError && filteredUniverses.length === 0 && (
                  <div className={styles.stateBlock}>
                    <Boxes size={24} color="#6de7df" />
                    <p className={styles.stateTitle}>
                      {isZh ? "没有可绑定的 Universe" : "No universes to bind"}
                    </p>
                    <p className={styles.stateText}>
                      {isZh
                        ? universes.length === 0
                          ? "你还没有创建任何 Universe。可以选择「新建 Universe」开始。"
                          : "没有匹配的 Universe，换个关键词试试。"
                        : universes.length === 0
                          ? "You haven't created any universes yet. Try \"Create new universe\"."
                          : "No matching universe. Try a different keyword."}
                    </p>
                  </div>
                )}

                {/* Universe 卡片列表 */}
                {!universesLoading && !universesError && filteredUniverses.length > 0 && (
                  <div className={styles.universeList}>
                    {filteredUniverses.map((opt) => {
                      const selected = universeId === opt.id;
                      const expanded = expandedUniverseId === opt.id;
                      return (
                        <div
                          key={opt.id}
                          className={`${styles.universeCard} ${selected ? styles.universeCardSelected : ""}`}
                        >
                          <div
                            className={styles.universeCardHeader}
                            onClick={() =>
                              setExpandedUniverseId(expanded ? null : opt.id)
                            }
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                setExpandedUniverseId(expanded ? null : opt.id);
                              }
                            }}
                          >
                            <div className={styles.universeCardMain}>
                              <h4 className={styles.universeCardName}>{opt.name}</h4>
                              <div className={styles.universeCardMeta}>
                                <span className={styles.universeCardMetaItem}>
                                  <Users size={12} /> {opt.characterCount}
                                </span>
                                <span className={styles.universeCardMetaItem}>
                                  <ScrollText size={12} /> {opt.ruleCount}
                                </span>
                                <span className={styles.universeCardMetaItem}>
                                  <Activity size={12} /> {formatLastActivity(opt.lastActivityAt, isZh)}
                                </span>
                                <span className={`${styles.healthBadge} ${healthClass(opt.healthScore)}`}>
                                  {isZh ? healthLabelZh(opt.healthScore) : opt.healthScore >= 80 ? "healthy" : opt.healthScore >= 65 ? "watch" : "at risk"}
                                </span>
                              </div>
                            </div>
                            {expanded ? <ChevronDown size={16} color="#6b7280" /> : <ChevronRight size={16} color="#6b7280" />}
                          </div>

                          {expanded && (
                            <div className={styles.universeCardPreview}>
                              <p className={styles.universeSummary}>{opt.summary}</p>
                              <div className={styles.universeDetailRow}>
                                <span>{isZh ? `角色 ${opt.characterCount}` : `${opt.characterCount} characters`}</span>
                                <span>{isZh ? `规则 ${opt.ruleCount}` : `${opt.ruleCount} rules`}</span>
                                <span>{isZh ? `健康度 ${opt.healthScore}` : `Health ${opt.healthScore}`}</span>
                                <span>{isZh ? `最近活动 ${formatLastActivity(opt.lastActivityAt, isZh)}` : `Last activity ${formatLastActivity(opt.lastActivityAt, isZh)}`}</span>
                              </div>
                              <button
                                type="button"
                                className={styles.universeSelectBtn}
                                style={{ marginTop: 12 }}
                                onClick={() => setUniverseId(opt.id)}
                              >
                                {selected
                                  ? (isZh ? "已选择" : "Selected")
                                  : (isZh ? "选择此 Universe" : "Select this universe")}
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* 第 4 步：确认创建 */}
        {step === "confirm" && (
          <section>
            <h2 className={styles.stepTitle}>
              {isZh ? "确认并创建" : "Confirm and create"}
            </h2>
            <p className={styles.stepHint}>
              {isZh
                ? "检查以下信息，确认后直接进入工作台。"
                : "Review the details below — you'll jump straight into the workbench."}
            </p>

            <div className={styles.confirmSummary}>
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>{isZh ? "内容类型" : "Content type"}</span>
                <span className={styles.confirmValue}>
                  {(() => {
                    const ct = CONTENT_TYPES.find((c) => c.type === contentType);
                    return ct ? (isZh ? ct.titleZh : ct.titleEn) : contentType;
                  })()}
                </span>
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>{isZh ? "开始方式" : "Start mode"}</span>
                <span className={styles.confirmValue}>
                  {(() => {
                    const card = ENTRY_CARDS.find((c) => c.mode === startMode);
                    return card ? (isZh ? card.titleZh : card.titleEn) : startMode;
                  })()}
                </span>
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>{isZh ? "标题" : "Title"}</span>
                <span className={styles.confirmValue}>{title.trim()}</span>
              </div>
              <div className={styles.confirmRow}>
                <span className={styles.confirmLabel}>{isZh ? "Universe" : "Universe"}</span>
                <span className={styles.confirmValue}>
                  {universeAction === "create_new"
                    ? isZh ? "新建空白 Universe" : "Create new blank universe"
                    : universeAction === "skip"
                      ? isZh ? "暂不绑定" : "Skip (unbound)"
                      : universeId || (isZh ? "未选择" : "Not selected")}
                </span>
              </div>
            </div>

            <div className={styles.confirmHint}>
              {isZh
                ? "集数、语言、模型与生产参数不在此处要求，进入工作台后按需补充。"
                : "Episode count, language, model and production params are not required here — fill them in the workbench as needed."}
            </div>

            {submitError && (
              <p className={styles.errorText}>
                {isZh ? "创建失败：" : "Create failed: "}{submitError}
              </p>
            )}
          </section>
        )}

        {/* 底部导航 */}
        {step !== "entry" && (
          <div className={styles.navBar}>
            <button
              type="button"
              className={styles.navBtn}
              onClick={handleBack}
              disabled={submitting}
            >
              <ArrowLeft size={14} style={{ marginRight: 6, verticalAlign: "middle" }} />
              {isZh ? "上一步" : "Back"}
            </button>
            <button
              type="button"
              className={`${styles.navBtn} ${styles.navBtnPrimary}`}
              onClick={handleNext}
              disabled={!canAdvance()}
            >
              {step === "confirm"
                ? submitting
                  ? (isZh ? "创建中…" : "Creating…")
                  : (isZh ? "确认创建" : "Create project")
                : (isZh ? "下一步" : "Next")}
              {step !== "confirm" && (
                <ArrowRight size={14} style={{ marginLeft: 6, verticalAlign: "middle" }} />
              )}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
