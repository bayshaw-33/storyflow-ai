/**
 * KIIKIS 2.1 Phase 1 — Creative Event 契约 (K21-EV-001..005)
 *
 * 领域事件的纯函数校验器。持久化层、API、消费者都通过 parseCreativeEvent
 * 把外部输入收敛为可信的 CreativeEventV1。契约层不依赖数据库或运行时。
 *
 * 规则：
 * 1. 事件为版本化契约 (schemaVersion > 0)
 * 2. 拥有单调正整数 sequence (K21-EV-003)
 * 3. 拥有稳定 idempotency key (K21-EV-004)
 * 4. payload 拒绝密钥、完整 prompt、token、secret 和私有路径 (K21-EV-005)
 * 5. 返回值被冻结，防止下游意外篡改
 */

/** 事件可见性分级，决定 RLS 与 Realtime 投递边界。 */
export const CREATIVE_EVENT_VISIBILITIES = ["private", "collaborators", "public"] as const;
export type CreativeEventVisibility = (typeof CREATIVE_EVENT_VISIBILITIES)[number];

export const CREATIVE_EVENT_ACTOR_TYPES = ["user", "system"] as const;
export type CreativeEventActorType = (typeof CREATIVE_EVENT_ACTOR_TYPES)[number];

/** 当前契约 schema 版本。新增字段时递增并保持向后兼容解析。 */
export const CREATIVE_EVENT_SCHEMA_VERSION = 1 as const;

/**
 * 敏感 payload 字段拒绝清单 (K21-EV-005)。
 * 导出供 audit 工具与文档同步使用。匹配时对键名做归一化
 * (去下划线/连字符 + 转小写)，所以 "apiKey"、"api_key"、"API-KEY" 均命中。
 */
export const SENSITIVE_PAYLOAD_KEYS = [
  "apiKey",
  "api_key",
  "accessToken",
  "access_token",
  "refreshToken",
  "refresh_token",
  "serviceRoleKey",
  "service_role_key",
  "secret",
  "token",
  "password",
  "storagePath",
  "storage_path",
  "privateKey",
  "private_key",
  "prompt",
  "fullPrompt",
  "full_prompt",
  "path",
] as const;

const SENSITIVE_KEY_NORMALIZED = new Set(
  SENSITIVE_PAYLOAD_KEYS.map((k) => normalizeKey(k))
);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[_-]/g, "");
}

/** 序列化前可空字段。 */
export interface CreativeEventV1 {
  readonly id: string;
  readonly sequence: number;
  readonly eventType: string;
  readonly schemaVersion: number;
  readonly actorType: CreativeEventActorType;
  readonly actorId: string | null;
  readonly ownerId: string;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly resourceVersion: string | null;
  readonly taskId: string | null;
  readonly idempotencyKey: string;
  readonly visibility: CreativeEventVisibility;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly createdAt: string;
}

/** 契约层输入类型 (id 可选，由解析器补发)。 */
export type CreativeEventInput = Omit<CreativeEventV1, "id" | "payload"> & {
  readonly id?: string;
  readonly payload?: Record<string, unknown> | null;
};

/** 契约错误，携带稳定 code 供 API/日志分流。 */
export class CreativeEventError extends Error {
  readonly code = "invalid_creative_event" as const;
  readonly field: string;

  constructor(field: string, message: string) {
    super(`${field}: ${message}`);
    this.name = "CreativeEventError";
    this.field = field;
  }
}

function isPositiveInt(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isIsoLike(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

function fail(field: string, message: string): never {
  throw new CreativeEventError(field, message);
}

/**
 * 深度扫描 payload 中是否含敏感键。
 * 支持嵌套对象与数组；遇到循环引用时停止该分支。
 */
function assertPayloadSafe(payload: unknown, path = "payload", seen = new WeakSet<object>()): void {
  if (payload === null || typeof payload !== "object") return;
  if (seen.has(payload as object)) return;
  seen.add(payload as object);

  if (Array.isArray(payload)) {
    for (let i = 0; i < payload.length; i++) {
      assertPayloadSafe(payload[i], `${path}[${i}]`, seen);
    }
    return;
  }

  const obj = payload as Record<string, unknown>;
  for (const key of Object.keys(obj)) {
    if (SENSITIVE_KEY_NORMALIZED.has(normalizeKey(key))) {
      fail("payload", `sensitive key "${key}" is not allowed in event payload at ${path}`);
    }
    assertPayloadSafe(obj[key], `${path}.${key}`, seen);
  }
}

/**
 * 解析并校验输入，返回冻结的 CreativeEventV1。
 * 任何契约违例都抛 CreativeEventError，不返回部分结果。
 */
export function parseCreativeEvent(input: CreativeEventInput): CreativeEventV1 {
  if (!input || typeof input !== "object") {
    fail("event", "input must be an object");
  }

  const { id } = input;
  if (id !== undefined) {
    if (!isNonEmptyString(id)) fail("id", "must be a non-empty string");
  }

  if (!isPositiveInt(input.sequence)) fail("sequence", "must be a positive integer");

  if (!isNonEmptyString(input.eventType)) fail("event_type", "must be a non-empty string");

  if (!isPositiveInt(input.schemaVersion)) {
    fail("schema_version", "must be a positive integer");
  }

  if (!CREATIVE_EVENT_ACTOR_TYPES.includes(input.actorType as CreativeEventActorType)) {
    fail("actor_type", `must be one of ${CREATIVE_EVENT_ACTOR_TYPES.join(", ")}`);
  }

  if (input.actorType === "user") {
    if (!isNonEmptyString(input.actorId)) {
      fail("actor_id", "must be a non-empty string when actor_type=user");
    }
  } else if (input.actorId !== null && input.actorId !== undefined) {
    fail("actor_id", "must be null when actor_type=system");
  }

  if (!isNonEmptyString(input.ownerId)) fail("owner_id", "must be a non-empty string");

  if (!isNonEmptyString(input.resourceType)) fail("resource_type", "must be a non-empty string");

  if (!isNonEmptyString(input.resourceId)) fail("resource_id", "must be a non-empty string");

  const resourceVersion =
    input.resourceVersion === null || input.resourceVersion === undefined
      ? null
      : input.resourceVersion;
  if (resourceVersion !== null && !isNonEmptyString(resourceVersion)) {
    fail("resource_version", "must be a non-empty string or null");
  }

  const taskId = input.taskId === null || input.taskId === undefined ? null : input.taskId;
  if (taskId !== null && !isNonEmptyString(taskId)) {
    fail("task_id", "must be a non-empty string or null");
  }

  const idempotencyKey = isNonEmptyString(input.idempotencyKey)
    ? (input.idempotencyKey as string).trim()
    : "";
  if (idempotencyKey.length === 0) {
    fail("idempotency_key", "must be a non-empty string");
  }

  if (!CREATIVE_EVENT_VISIBILITIES.includes(input.visibility as CreativeEventVisibility)) {
    fail("visibility", `must be one of ${CREATIVE_EVENT_VISIBILITIES.join(", ")}`);
  }

  const payload = input.payload === null || input.payload === undefined ? {} : input.payload;
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    fail("payload", "must be a JSON object");
  }
  assertPayloadSafe(payload);

  if (!isIsoLike(input.occurredAt)) fail("occurred_at", "must be an ISO-8601 timestamp");
  if (!isIsoLike(input.createdAt)) fail("created_at", "must be an ISO-8601 timestamp");

  const event: CreativeEventV1 = {
    id: id ?? crypto.randomUUID(),
    sequence: input.sequence,
    eventType: input.eventType,
    schemaVersion: input.schemaVersion,
    actorType: input.actorType,
    actorId: input.actorType === "user" ? (input.actorId as string) : null,
    ownerId: input.ownerId,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    resourceVersion,
    taskId,
    idempotencyKey,
    visibility: input.visibility,
    payload: payload as Readonly<Record<string, unknown>>,
    occurredAt: input.occurredAt,
    createdAt: input.createdAt,
  };

  return Object.freeze(event);
}

/** 类型守卫：判断未知值是否为已解析的 CreativeEventV1。 */
export function isCreativeEvent(value: unknown): value is CreativeEventV1 {
  return (
    typeof value === "object" &&
    value !== null &&
    Object.isFrozen(value) &&
    typeof (value as CreativeEventV1).schemaVersion === "number" &&
    typeof (value as CreativeEventV1).idempotencyKey === "string"
  );
}
