# V2 Provider API Key 配置指南

本文档汇总 TRAE-V2 所有需要配置的 Provider API Key，按 V2 任务包分类。

> **配置位置**：Vercel 项目 Settings → Environment Variables（生产）或本地 `.env.local`（开发）

## 必需 Key（运行时验收阻塞）

### TRAE-V2-03：Voice TTS Provider

| 变量名 | 用途 | 获取方式 |
|---|---|---|
| `TTS_PROVIDER` | TTS provider 选择：`placeholder`（不可用）/ `openai` | 手动设置 |
| `OPENAI_API_KEY` 或 `OPENAI_TTS_API_KEY` | OpenAI TTS 认证（当 `TTS_PROVIDER=openai` 时必需） | https://platform.openai.com/api-keys |
| `OPENAI_TTS_MODEL` | 可选，TTS 模型，默认 `tts-1` | — |
| `OPENAI_BASE_URL` | 可选，OpenAI 端点，默认 `https://api.openai.com` | — |

**默认行为**：`TTS_PROVIDER` 未设置或为 `placeholder` 时，Voice Line 生成走 placeholder provider（返回错误提示），不实际调用 TTS。

---

### TRAE-V2-05：Video Gateway Provider Keys

| 变量名 | 用途 | 获取方式 |
|---|---|---|
| `RUNWAY_API_KEY` | Runway Gen-4 / Gen-4.5 视频生成 | https://runwayml.com/ → Dashboard → API Keys |
| `RUNWAY_VIDEO_MODEL` | 可选，模型默认 `gen4_turbo`（可选 `gen4.5` / `veo3.1` / `seedance2`） | — |
| `ARK_API_KEY` | 火山引擎 Ark API（Seedance 2.0 直连） | https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey |
| `VOLC_ARK_API_KEY` | `ARK_API_KEY` 的等价别名（优先级较低） | 同上 |
| `SEEDANCE_VIDEO_MODEL` | 可选，模型默认 `doubao-seedance-2-0-260128` | — |
| `ARK_SEEDANCE_MODEL` | 兼容别名（旧命名，不推荐） | — |

**可用性逻辑**：`catalog.computeAvailability` 按 env 动态判断——`RUNWAY_API_KEY` 存在则 Runway 可用，`ARK_API_KEY` 存在则 Seedance 可用。

---

### TRAE-V2-01~V2-05 通用：LLM / Image Provider

| 变量名 | 用途 | 获取方式 |
|---|---|---|
| `ATLASCLOUD_API_KEY` | Atlas Cloud 统一 AI 模型网关（art generation） | https://atlascloud.ai/ |
| `ATLASCLOUD_LLM_BASE_URL` | Atlas LLM 端点，默认 `https://api.atlascloud.ai/v1` | — |
| `ATLASCLOUD_LLM_MODEL` | Atlas LLM 模型（Gemini 精确 id） | — |
| `MINIMAX_API_KEY` | MiniMax LLM + 图像 + 视频生成 | https://www.minimaxi.com/ |
| `MINIMAX_MODEL` | MiniMax LLM 模型，默认 `MiniMax-M3` | — |
| `MINIMAX_IMAGE_MODEL` | MiniMax 图像模型，默认 `image-01` | — |
| `MINIMAX_VIDEO_MODEL` | MiniMax 视频模型，默认 `MiniMax-Hailuo-02` | — |
| `DEEPSEEK_API_KEY` | DeepSeek LLM | https://platform.deepseek.com/ |
| `BFL_API_KEY` | Black Forest Labs FLUX 模型（图像） | https://blackforestlabs.ai/ |

---

## 可选 Key

### Access Control / Gating

| 变量名 | 用途 |
|---|---|
| `ART_ATLAS_ALLOW_ALL_AUTHENTICATED_USERS` | 设为 `true` 允许所有登录用户使用 Atlas 模型 |
| `ART_ATLAS_AUTHORIZED_USER_IDS` | 白名单 UUID（逗号分隔） |
| `ART_ATLAS_AUTHORIZED_EMAILS` | 白名单邮箱（逗号分隔） |
| `UNIVERSE_ENGINE_ENABLED` | Universe 引擎生产环境强制开启 |
| `UNIVERSE_DEV_UNLOCK` | 非生产环境开发解锁 |
| `UNIVERSE_ALLOWLIST_EMAILS` | Universe 引擎邮箱白名单 |
| `EDITOR_FRAMEWORK_ENABLED` | V2-06 Editor Framework 开关（`true` 启用） |

### Video Generation Timeouts

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `VIDEO_CREATE_TIMEOUT_MS` | 90000 | 视频创建超时 |
| `VIDEO_QUERY_TIMEOUT_MS` | 30000 | 视频查询超时 |
| `VIDEO_RETRIEVE_TIMEOUT_MS` | 30000 | 视频下载超时 |

---

## 最小运行时验收配置

为解除 V2-01~V2-07 运行时验收阻塞，至少需要：

```bash
# LLM（Director / Prompt 合成）
ATLASCLOUD_API_KEY=...
ATLASCLOUD_LLM_MODEL=gemini-2.5-flash
# 或
MINIMAX_API_KEY=...

# TTS（Voice Line 生成）
TTS_PROVIDER=openai
OPENAI_API_KEY=sk-...

# Video Gateway（任一即可）
RUNWAY_API_KEY=...
# 或
ARK_API_KEY=...

# Editor Framework 开关
EDITOR_FRAMEWORK_ENABLED=true
```

## 安全约束

- 所有 Key 仅写在 `.env.local` 或 Vercel 环境变量，**不提交到 git**
- `SUPABASE_SERVICE_ROLE_KEY` 仅服务端使用，**不暴露到客户端 bundle**
- Provider 原始错误不暴露给前端（通过 `redacted.providerRawErrors` 控制）
- 临时签名 URL 不入库（由 `storage.ts` 生成有限期 URL）
