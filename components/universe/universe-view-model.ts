/**
 * Universe 视图模型 —— 纯展示模型 + 过滤/排序逻辑。
 * 不持有 React state，不发起网络请求；仅提供类型、纯函数和文案。
 *
 * PRD v3.0 §5 / §6 阶段 C：列表页过滤排序、详情页 5 主区域的展示契约。
 */

// ===== 列表页 DTO（与 /api/universe/summaries 对齐） =====

export type UniverseListItem = {
  id: string;
  name: string;
  status: string;
  cardSummary: string;
  coverUrl: string | null;
  tags: string[];
  workCount: number;
  characterCount: number;
  locationCount: number;
  pendingInboxCount: number;
  updatedAt: string;
};

// ===== 详情页 overview DTO（与 /api/universe/:id/overview 对齐） =====

export type UniverseOverviewData = {
  universe: {
    id: string;
    name: string;
    cardSummary: string;
    description: string;
    genre: string;
    defaultLanguage: string;
    targetMarkets: string[];
    tone: string;
    status: string;
    updatedAt: string;
  };
  counts: {
    characters: number;
    locations: number;
    props: number;
    organizations: number;
    works: number;
    canonFacts: number;
    relationships: number;
    timeline: number;
    pendingInbox: number;
  };
  representativeEntities: Array<{
    id: string;
    type: string;
    name: string;
    thumbnail: string | null;
  }>;
  recentChanges: Array<{
    id: string;
    type: string;
    name: string;
    updatedAt: string;
  }>;
  pendingItems: Array<{
    id: string;
    type: string;
    summary: string;
    confidence: number;
    source: string;
  }>;
  canonConflicts: number;
  works: Array<{
    id: string;
    title: string;
    projectRole: string;
    updatedAt: string;
  }>;
  requestId: string;
};

// ===== 详情页 works DTO（与 /api/universe/:id/works 对齐） =====

export type WorkCard = {
  id: string;
  title: string;
  projectRole: string;
  status: string;
  shotCount: number;
  characterCount: number;
  sceneCount: number;
  propCount: number;
  coverUrl: string | null;
  updatedAt: string;
};

export type UniverseWorksResponse = {
  works: WorkCard[];
  requestId: string;
};

export type WorkDetailResponse = {
  project: {
    id: string;
    title: string;
    projectRole: string;
    status: string;
    updatedAt: string;
  };
  characters: Array<{ name: string; thumbnail: string | null }>;
  scenes: Array<{ name: string; thumbnail: string | null }>;
  props: Array<{ name: string; thumbnail: string | null }>;
  requestId: string;
};

// ===== 列表页过滤/排序 =====

export type UniverseStatusFilter = "all" | "active" | "archived";
export type UniverseSortKey = "updated" | "name" | "works";
export type UniverseViewMode = "cards" | "graph";

export type UniverseListFilter = {
  search: string;
  status: UniverseStatusFilter;
  tag: string;
  sort: UniverseSortKey;
};

export const DEFAULT_UNIVERSE_FILTER: UniverseListFilter = {
  search: "",
  status: "all",
  tag: "",
  sort: "updated",
};

/**
 * PRD §5 列表页：按名称和 cardSummary 搜索；按状态筛选；按类型/市场标签筛选；
 * 按最近更新/名称/作品数排序。
 * 不得对完整 description 做前端全文扫描。
 */
export function filterAndSortUniverses(
  list: UniverseListItem[],
  filter: UniverseListFilter,
): UniverseListItem[] {
  const search = filter.search.trim().toLowerCase();
  const result = list.filter((item) => {
    if (filter.status !== "all" && item.status !== filter.status) return false;
    if (filter.tag && !item.tags.includes(filter.tag)) return false;
    if (search) {
      const haystack = `${item.name}\n${item.cardSummary}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  const sorted = [...result];
  switch (filter.sort) {
    case "name":
      sorted.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      break;
    case "works":
      sorted.sort((a, b) => b.workCount - a.workCount || b.updatedAt.localeCompare(a.updatedAt));
      break;
    case "updated":
    default:
      sorted.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      break;
  }
  return sorted;
}

export function collectUniverseTags(list: UniverseListItem[]): string[] {
  const seen = new Set<string>();
  for (const item of list) {
    for (const tag of item.tags) {
      const trimmed = tag.trim();
      if (trimmed) seen.add(trimmed);
    }
  }
  return Array.from(seen).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
}

// ===== 文本处理 =====

/**
 * PRD §4.2：卡片层 cardSummary 中文最多 60 字、英文最多 160 字，最多 2 行。
 * 卡片层不得显示 Markdown 标记。API 已做截断与去标记，这里作为前端兜底，
 * 防止脏数据进入卡片。
 */
export function sanitizeCardSummary(text: string): string {
  if (!text) return "";
  const stripped = stripMarkdown(text);
  return truncateForCard(stripped);
}

export function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/^>\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

export function truncateForCard(text: string): string {
  if (!text) return "";
  const hasCJK = /[\u4e00-\u9fff]/.test(text);
  const limit = hasCJK ? 60 : 160;
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trim()}…`;
}

/**
 * 字段级变更摘要：从 proposed_payload 中提取关键字段并渲染为「字段: 值」列表，
 * 避免把 raw JSON 作为主要 UI（PRD §6.5）。
 */
export function summarizeInboxFields(
  payload: Record<string, unknown>,
  itemType: string,
  isZh: boolean,
): Array<{ field: string; value: string }> {
  const labels = isZh
    ? {
        name: "名称",
        summary: "简介",
        description: "描述",
        appearance: "外貌",
        visual_notes: "视觉备注",
        relationship_type: "关系类型",
        source_entity: "源实体",
        target_entity: "目标实体",
        fact_text: "事实",
        category: "类别",
        importance: "重要性",
        title: "标题",
        date_label: "时间",
        actor_name: "演员",
        actor_id: "演员 ID",
        source_workflow: "来源工作流",
      }
    : {
        name: "Name",
        summary: "Summary",
        description: "Description",
        appearance: "Appearance",
        visual_notes: "Visual notes",
        relationship_type: "Relationship type",
        source_entity: "Source entity",
        target_entity: "Target entity",
        fact_text: "Fact",
        category: "Category",
        importance: "Importance",
        title: "Title",
        date_label: "Date",
        actor_name: "Actor",
        actor_id: "Actor ID",
        source_workflow: "Source workflow",
      };

  const priorityByType: Record<string, string[]> = {
    character: ["name", "summary", "appearance", "visual_notes", "actor_name", "actor_id", "source_workflow"],
    location: ["name", "summary", "description"],
    relationship: ["relationship_type", "source_entity", "target_entity", "summary"],
    canon_fact: ["fact_text", "category", "importance"],
    event: ["title", "date_label", "description"],
    rule: ["name", "summary"],
    state_change: ["title", "summary"],
  };

  const priority = priorityByType[itemType] || ["name", "title", "summary", "description"];
  const rows: Array<{ field: string; value: string }> = [];
  const seen = new Set<string>();

  for (const key of priority) {
    const raw = payload[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const value = renderFieldValue(raw);
    if (!value) continue;
    rows.push({ field: labels[key as keyof typeof labels] || key, value });
    seen.add(key);
  }

  // 兜底：若优先字段都为空，展示其他字符串字段（最多 4 个）
  if (!rows.length) {
    for (const [key, raw] of Object.entries(payload)) {
      if (seen.has(key)) continue;
      if (raw === undefined || raw === null || raw === "") continue;
      const value = renderFieldValue(raw);
      if (!value) continue;
      rows.push({ field: labels[key as keyof typeof labels] || key, value });
      if (rows.length >= 4) break;
    }
  }
  return rows;
}

function renderFieldValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    const items = value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
    return items.join(", ");
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const nested = record.name || record.title || record.appearance || record.summary;
    if (typeof nested === "string") return nested.trim();
    return "";
  }
  return "";
}

// ===== 时间格式化 =====

export function formatUpdatedAt(iso: string, isZh: boolean): string {
  if (!iso) return isZh ? "—" : "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  if (diffMin < 1) return isZh ? "刚刚" : "just now";
  if (diffMin < 60) return isZh ? `${diffMin} 分钟前` : `${diffMin}m ago`;
  if (diffHour < 24) return isZh ? `${diffHour} 小时前` : `${diffHour}h ago`;
  if (diffDay < 30) return isZh ? `${diffDay} 天前` : `${diffDay}d ago`;
  return date.toLocaleDateString(isZh ? "zh-CN" : "en-US");
}

export function formatConfidence(value: number): string {
  if (!Number.isFinite(value)) return "0%";
  return `${Math.round(value * 100)}%`;
}

// ===== 文案 =====

export type UniverseCopy = {
  isZh: boolean;
  list: {
    title: string;
    subtitle: string;
    searchPlaceholder: string;
    statusAll: string;
    statusActive: string;
    statusArchived: string;
    tagAll: string;
    sortUpdated: string;
    sortName: string;
    sortWorks: string;
    viewCards: string;
    viewGraph: string;
    create: string;
    loading: string;
    empty: string;
    emptyHint: string;
    help: string;
    graphEmpty: string;
    countsUniverses: string;
    countsActive: string;
    countsInbox: string;
  };
  card: {
    active: string;
    archived: string;
    works: string;
    characters: string;
    locations: string;
    inboxBadge: string;
    more: string;
    editSummary: string;
    archive: string;
    updated: string;
    noSummary: string;
  };
  detail: {
    back: string;
    overview: string;
    assets: string;
    works: string;
    canon: string;
    inbox: string;
    bible: string;
    bibleOpen: string;
    bibleClose: string;
    overviewCover: string;
    genre: string;
    language: string;
    markets: string;
    tone: string;
    counts: string;
    representatives: string;
    recentChanges: string;
    pendingReminder: string;
    worksPreview: string;
    canonConflicts: string;
    noRepresentatives: string;
  };
  assets: {
    all: string;
    character: string;
    location: string;
    object: string;
    organization: string;
    usedBy: string;
    source: string;
    updated: string;
    empty: string;
    generate: string;
    generateHint: string;
  };
  works: {
    empty: string;
    loading: string;
    shots: string;
    characters: string;
    scenes: string;
    props: string;
    role: string;
    status: string;
    drawerOpen: string;
    drawerClose: string;
    mainCharacters: string;
    coreScenes: string;
    keyProps: string;
    enterCreation: string;
    enterProduction: string;
    notLinked: string;
  };
  canon: {
    facts: string;
    relationships: string;
    timeline: string;
    checks: string;
    empty: string;
    checkFailed: string;
    locked: string;
    importance: string;
    severity: string;
    runCheck: string;
    selectProject: string;
  };
  inbox: {
    empty: string;
    object: string;
    source: string;
    excerpt: string;
    aiFallback: string;
    confidence: string;
    fields: string;
    accept: string;
    editAccept: string;
    reject: string;
    pending: string;
    accepted: string;
    rejected: string;
    edited: string;
    editTitle: string;
    editBody: string;
    cancel: string;
    save: string;
    invalidJson: string;
    extract: string;
    extractHint: string;
  };
};

export function getUniverseCopy(isZh: boolean): UniverseCopy {
  if (isZh) {
    return {
      isZh: true,
      list: {
        title: "宇宙",
        subtitle: "一个宇宙。所有工作流自动继承。",
        searchPlaceholder: "搜索宇宙名称或摘要…",
        statusAll: "全部状态",
        statusActive: "活跃",
        statusArchived: "已归档",
        tagAll: "全部标签",
        sortUpdated: "最近更新",
        sortName: "名称",
        sortWorks: "作品数",
        viewCards: "卡片视图",
        viewGraph: "关系图视图",
        create: "新建宇宙",
        loading: "正在读取宇宙…",
        empty: "还没有宇宙",
        emptyHint: "从已有的小说、剧本、分镜或视频项目创建你的第一个宇宙。",
        help: "什么是 Universe？",
        graphEmpty: "暂无宇宙节点。创建第一个宇宙后，关系图会在这里展开。",
        countsUniverses: "宇宙",
        countsActive: "活跃中",
        countsInbox: "待审 Inbox",
      },
      card: {
        active: "活跃中",
        archived: "已归档",
        works: "作品",
        characters: "角色",
        locations: "地点",
        inboxBadge: "待审",
        more: "更多",
        editSummary: "编辑摘要",
        archive: "归档",
        updated: "更新",
        noSummary: "暂无摘要。",
      },
      detail: {
        back: "返回宇宙列表",
        overview: "概览",
        assets: "资产",
        works: "作品",
        canon: "Canon",
        inbox: "待处理 Inbox",
        bible: "Universe Bible",
        bibleOpen: "查看完整 Universe Bible",
        bibleClose: "关闭",
        overviewCover: "宇宙封面",
        genre: "类型",
        language: "语言",
        markets: "市场",
        tone: "基调",
        counts: "计数",
        representatives: "代表实体",
        recentChanges: "最近更新",
        pendingReminder: "待处理提醒",
        worksPreview: "关联作品预览",
        canonConflicts: "Canon 冲突",
        noRepresentatives: "暂无代表实体缩略图。",
      },
      assets: {
        all: "全部",
        character: "角色",
        location: "地点",
        object: "道具",
        organization: "组织",
        usedBy: "被作品使用",
        source: "来源作品",
        updated: "更新时间",
        empty: "暂无资产。",
        generate: "生成形象",
        generateHint: "宇宙实体图像端点接入中",
      },
      works: {
        empty: "还没有关联作品。",
        loading: "正在读取作品资产…",
        shots: "镜头",
        characters: "角色",
        scenes: "场景",
        props: "道具",
        role: "角色类型",
        status: "状态",
        drawerOpen: "查看主要角色、核心场景与关键道具",
        drawerClose: "收起",
        mainCharacters: "主要角色",
        coreScenes: "核心场景",
        keyProps: "关键道具",
        enterCreation: "进入创作工作台",
        enterProduction: "进入制作工作台",
        notLinked: "未关联",
      },
      canon: {
        facts: "事实",
        relationships: "关系",
        timeline: "时间线",
        checks: "一致性检查",
        empty: "暂无 Canon 记录。",
        checkFailed: "检查失败",
        locked: "已锁定",
        importance: "重要程度",
        severity: "严重程度",
        runCheck: "运行 Canon Check",
        selectProject: "选择要检查的项目",
      },
      inbox: {
        empty: "Inbox 为空。选择关联项目并点击「抽取更新」可生成候选项。",
        object: "对象",
        source: "来源",
        excerpt: "原文片段",
        aiFallback: "AI 来源",
        confidence: "置信度",
        fields: "字段变更",
        accept: "接受",
        editAccept: "编辑后接受",
        reject: "拒绝",
        pending: "待处理",
        accepted: "已接受",
        rejected: "已拒绝",
        edited: "已编辑",
        editTitle: "编辑候选项",
        editBody: "在写入 canon 之前调整结构化数据。已锁定的 canon 不会被覆盖。",
        cancel: "取消",
        save: "接受编辑",
        invalidJson: "JSON 必须是一个对象。",
        extract: "抽取更新",
        extractHint: "从关联项目中提取候选项进入 Inbox。",
      },
    };
  }
  return {
    isZh: false,
    list: {
      title: "Universes",
      subtitle: "One Universe. Every Workflow Inherits It.",
      searchPlaceholder: "Search by name or summary…",
      statusAll: "All status",
      statusActive: "Active",
      statusArchived: "Archived",
      tagAll: "All tags",
      sortUpdated: "Last updated",
      sortName: "Name",
      sortWorks: "Work count",
      viewCards: "Card view",
      viewGraph: "Graph view",
      create: "New Universe",
      loading: "Loading universes…",
      empty: "No Universe yet",
      emptyHint: "Create your first Universe from a novel, script, storyboard, or video project.",
      help: "What is Universe?",
      graphEmpty: "No Universe nodes yet. Create one and the graph will unfold here.",
      countsUniverses: "Universes",
      countsActive: "Active",
      countsInbox: "Inbox",
    },
    card: {
      active: "Active",
      archived: "Archived",
      works: "Works",
      characters: "Cast",
      locations: "Locales",
      inboxBadge: "Pending",
      more: "More",
      editSummary: "Edit summary",
      archive: "Archive",
      updated: "Updated",
      noSummary: "No summary yet.",
    },
    detail: {
      back: "Back to Universes",
      overview: "Overview",
      assets: "Assets",
      works: "Works",
      canon: "Canon",
      inbox: "Inbox",
      bible: "Universe Bible",
      bibleOpen: "Open full Universe Bible",
      bibleClose: "Close",
      overviewCover: "Universe cover",
      genre: "Genre",
      language: "Language",
      markets: "Markets",
      tone: "Tone",
      counts: "Counts",
      representatives: "Representative entities",
      recentChanges: "Recent changes",
      pendingReminder: "Pending reminder",
      worksPreview: "Linked works preview",
      canonConflicts: "Canon conflicts",
      noRepresentatives: "No representative entity thumbnails yet.",
    },
    assets: {
      all: "All",
      character: "Characters",
      location: "Locations",
      object: "Props",
      organization: "Organizations",
      usedBy: "Used by works",
      source: "Source project",
      updated: "Updated",
      empty: "No assets yet.",
      generate: "Generate appearance",
      generateHint: "Universe entity image generation is coming soon",
    },
    works: {
      empty: "No linked works yet.",
      loading: "Loading work assets…",
      shots: "shots",
      characters: "cast",
      scenes: "scenes",
      props: "props",
      role: "Role",
      status: "Status",
      drawerOpen: "View main characters, core scenes and key props",
      drawerClose: "Hide",
      mainCharacters: "Main characters",
      coreScenes: "Core scenes",
      keyProps: "Key props",
      enterCreation: "Open creation workbench",
      enterProduction: "Open production workbench",
      notLinked: "Not linked",
    },
    canon: {
      facts: "Facts",
      relationships: "Relationships",
      timeline: "Timeline",
      checks: "Consistency checks",
      empty: "No canon records yet.",
      checkFailed: "Check failed",
      locked: "Locked",
      importance: "Importance",
      severity: "Severity",
      runCheck: "Run Canon Check",
      selectProject: "Select a project to check",
    },
    inbox: {
      empty: "Inbox is empty. Select a linked project and click Extract Updates to review candidates.",
      object: "Object",
      source: "Source",
      excerpt: "Excerpt",
      aiFallback: "AI source",
      confidence: "Confidence",
      fields: "Field changes",
      accept: "Accept",
      editAccept: "Edit + Accept",
      reject: "Reject",
      pending: "Pending",
      accepted: "Accepted",
      rejected: "Rejected",
      edited: "Edited",
      editTitle: "Edit candidate",
      editBody: "Adjust the structured payload before writing it into canon. Locked canon is not overwritten automatically.",
      cancel: "Cancel",
      save: "Accept edited",
      invalidJson: "JSON must be an object.",
      extract: "Extract Updates",
      extractHint: "Pull candidates from a linked project into Inbox.",
    },
  };
}
