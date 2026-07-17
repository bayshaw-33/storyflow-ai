# Storyboard AI API — KIIKIS-P1-KIMI-002

> 分镜 AI 主链接口文档：严格分析（analyze）、即梦/绘图提示词（prompts）、资产图生成（assets/generate）、版本选定（assets/select-version）、分镜图生成（shots/[shotId]/generate-image）。
> 契约类型以 `lib/storyboard/contracts.ts`（Codex 冻结）为准；本文档描述运行时行为与错误码。

通用约定：

- 全部端点要求登录（`authenticateRequest`），未登录 → `401 UNAUTHENTICATED`；服务端缺 Service Role 配置 → `500 MISSING_SUPABASE_SERVICE_ROLE_KEY`。
- 成功响应包 `{ success: true, ... }`；失败响应 `{ success: false, error, code, details? }`。
- AI 输出绝不轻信：服务端严格校验并重新分配全部 ID（`p_scene_<o>` / `p_shot_<so>_<sho>` / `p_asset_<kind>_<n>`，`idSource: "client"`）。
- 失败显式化：绝不以 200 + 空 scenes 充当失败。

## 1. POST /api/storyboard/analyze

严格剧本分析。**只读，不写库**——分析结果是提案，持久化由 Codex 保存层负责。

- 请求：`AnalyzeRequest`（`mode: "full" | "scene"`；scene 模式必须带 `sceneId`；`targetDurationSeconds` ≤ 600 正数；`source` ≤ 100k 字符非空；`aspectRatio ∈ 9:16|16:9|1:1`）。
- 响应：`AnalyzeResponse`（`analysisId` / `analysisVersion: 1` / `sourceHash: "sha256:<hex>"` / `revision: expectedRevision + 1` / `scenes[]` / `assets.{characters,locations,props}`）。
- 时长归一：总时长偏离目标 >20% 时按比例缩放，保留 1 位小数，单镜 clamp 到 [2, 10]s。
- 合并：full 模式按 order 匹配已有场景，`locked || userEdited` 的镜头原样保留（`idSource: "server"`）；scene 模式只返回合并后的目标场景。
- 错误码：`422 INVALID_JSON` / `422 MISSING_FIELD`（`details.fields`）/ `422 ANALYZE_OUTPUT_INVALID`（AI 输出不合法，含字段路径）/ `422 SCENE_NOT_FOUND` / `502 AI_CALL_FAILED`。

## 2. POST /api/storyboard/prompts

按镜头批量生成绘图提示词 + 即梦视频提示词。

- 请求：`PromptRequest`（`shotIds` ≤ 200；`language: "zh" | "en"`，默认 zh）。
- 响应：`PromptResponse`（`revision: expectedRevision + 1`；`prompts[]` 混合成功/失败项——单 shot 失败不影响其他项，HTTP 仍为 200）。
  - 成功项：`{ shotId, imagePrompt, jimengVideoPrompt, negativePrompt, referenceVersionIds[], inputHash: "sha256:<hex>" }`
  - 失败项：`{ shotId, error, code }`（如 `SHOT_NOT_FOUND`）
- 模板版本 `PROMPT_TEMPLATE_VERSION = "sb-prompts/1"`。人物描述单一来源：已批准版本的 appearance 优先，否则资产 description，绝不拼接两者。
- 即梦提示词台词 `台词：“<原文>”` 逐字保留原文，不翻译。
- `inputHash` 覆盖 `referenceVersionIds`（排序后）+ 模板版本——`selectedVersionId` 变化必导致 hash 变化；同输入必得同 hash。

## 3. POST /api/storyboard/assets/generate

为单个资产（character / location / prop）生成候选图并写入版本。

- 请求：`{ projectId, sourceUnitId, asset: { kind, name, description, prompt, aliases? }, idempotencyKey, count? = 4, aspectRatio? = "9:16" }`
- 流程：upsert 资产（project + kind + dedupeKey 去重）→ 幂等检查 → 生成 → 持久化 → 写 versions。
- 响应：`{ assetId, jobId, reused, status: "completed", versions: [{ versionId, previewUrl, provider, model, prompt }] }`

## 4. POST /api/storyboard/assets/select-version

- 请求：`{ assetId, versionId }`；调用 `markVersionSelected` 后响应 `{ assetId, selectedVersionId }`。
- 选定版本即后续 prompts / generate-image 的参考图来源（`referenceVersionIds` / 签名参考 URL）。

## 5. POST /api/storyboard/shots/[shotId]/generate-image

参考版本驱动的分镜图生成。

- 请求：`{ idempotencyKey, count? = 4 (1|2|4), selection? = "smart" (smart|atlas|flux) }`
- 流程：加载镜头（owner 域，找不到 → `404 SHOT_NOT_FOUND`）→ 批准版本 → 签名参考 URL（7 天）→ 构建提示词 + inputHash → 幂等检查 `storyflow_generation_jobs`（同 key 且非 failed → `reused: true` 直接返回既有 job）→ 插入 running job → `generateArtImages` → 持久化 → 写 versions → job completed → 回写镜头（`status: "image_ready"`）。
- 响应：`{ jobId, reused, status, images: [{ versionId, previewUrl, provider, model }], inputHash, referenceVersionIds, imageVersionPersisted }`
- 生成失败 → job 置 failed + 镜头 status error + `500 IMAGE_GENERATION_FAILED`。
- **PGRST204 回退**：`storyboard_image_version_id` 列待 Codex 保存层迁移；列不存在时不带该列重试，响应 `imageVersionPersisted: false`。
- **锚点资产**：art schema 无分镜图表；分镜图版本挂在每镜头一个 `kind: "location"`、名为 `shot-frame <shotId>` 的锚点资产下。
- 不扣 credits（内部 Alpha）。

## 存储与测试

- 资产/版本复用既有表 `storyflow_art_assets` / `storyflow_art_asset_variants` / `storyflow_art_asset_versions`（无新迁移）。
- 测试：`tests/storyboard-{analyze,merge,prompts,generate-image}.test.mjs` + `tests/fixtures/storyboard/`（6 剧本 + 6 mock-ai JSON）。可注入接口（callAI / loadExistingState / fetchFn 等）在路由接真实实现、测试接 fake。
