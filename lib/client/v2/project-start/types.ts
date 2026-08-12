// K2-T-03 渐进式项目创建 · 领域类型
// contract_version = 2.0.0-alpha.1，按 PRD §10 领域契约自建。

export const CONTRACT_VERSION = "2.0.0-alpha.1";

/** 内容类型：用户想做什么 */
export type ContentType = "drama" | "novel" | "song" | "storyboard" | "video";

/** 开始方式：从什么素材启动项目 */
export type StartMode = "idea" | "script" | "material";

/** Universe 关联动作 */
export type UniverseAction = "create_new" | "bind_existing" | "skip";

/** 已有 Universe 的可选项（用于搜索 + 预览） */
export interface UniverseOption {
  id: string;
  name: string;
  summary: string;
  characterCount: number;
  ruleCount: number;
  lastActivityAt: string;
  healthScore: number;
}

/** 项目创建请求 · 最少必要字段 */
export interface ProjectStartRequest {
  contentType: ContentType;
  startMode: StartMode;
  title: string;
  universeAction: UniverseAction;
  /** 仅当 universeAction === "bind_existing" 时必填 */
  universeId?: string;
  /** 用于服务端契约校验 */
  contractVersion: string;
}

/** Universe 继承快照概念类型 · 创建时若绑定已有 Universe，会生成一份快照 */
export interface InheritanceSnapshot {
  snapshotId: string;
  universeId: string;
  takenAt: string;
  characterIds: string[];
  ruleIds: string[];
  relationshipIds: string[];
}

/** Fixture 数据结构 */
export interface ProjectStartFixture {
  contractVersion: string;
  contentTypeOptions: ContentType[];
  startModes: StartMode[];
  universeOptions: UniverseOption[];
}

/** 项目创建响应 */
export interface ProjectStartResponse {
  projectId: string;
  workbenchRoute: string;
  universeId?: string;
  snapshotId?: string;
}
