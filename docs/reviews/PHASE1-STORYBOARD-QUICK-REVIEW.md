# KIIKIS 第一阶段分镜链路快审

审查任务：`KIIKIS-P1-CODEX-001` 阶段 A

审查基线：`d4d2975`

结论：**BLOCK**。以下 BLOCKER 关闭前，不应把现有分镜链路作为 72 小时 Alpha 的可保存主链。

## BLOCKER

1. **Shot 身份不稳定，保存后图片生成会找不到镜头。**
   - 现象：客户端用随机 ID 创建 Shot；云端保存时删除全部 Shot 后重插，且序列化没有保留 `shot.id`。
   - 来源：`lib/production/api.ts:148-161,220-247`、`lib/production/state.ts:43-58`。
   - 后果：每次保存都会生成新数据库 UUID；客户端仍持有旧 ID，随后 `/api/production/generate-shot-image` 按旧 ID 查询会返回 404，历史任务、图片和 Shot 绑定也会漂移。
   - 修复：Shot ID 只由服务端签发并在首次保存响应中回传；后续按稳定 ID upsert。AI 返回的 ID 不可信，服务端需按原 Shot 或匹配结果复用 ID。

2. **当前保存是非事务性的“先删后写”，存在整集分镜丢失风险。**
   - 现象：保存依次更新项目、删除全部 Shot、插入新 Shot、再写 `delivery_package`，步骤之间没有事务和版本条件。
   - 来源：`lib/production/api.ts:116-167`。
   - 后果：删除成功而插入失败会丢失整集 Shot；并发或乱序自动保存会让旧请求覆盖新编辑；关系表与 JSON 快照可能互相矛盾。
   - 修复：以关系表为唯一当前态，在单个 Postgres 函数/事务中执行 `expectedRevision` 校验、项目更新、Shot upsert 和删除标记；冲突返回 409。`storyflow_versions` 只保存不可变快照。

3. **Creation → Production 交接没有绑定当前集，可能串项目或导入整部剧本。**
   - 现象：Creation 跳转参数使用 `sourceProjectId`，Production 只读取 `projectId`；全局 localStorage handoff 在缺少项目过滤时仍会被接收；交接包拼接全部 screenplay units，而不是当前 `activeUnitId`。
   - 来源：`components/creation/CreationWorkbench.tsx:619-625`、`components/production/ProductionWorkbench.tsx:84-120`、`lib/creative-handoff.ts:4-72`。
   - 后果：用户选择一集却可能分析整个项目，或读到上一次其他项目的交接内容，违反“项目和集之间不串数据”。
   - 修复：统一跳转契约为 `projectId + episodeId`（若现阶段无 episode，使用稳定 `sourceUnitId`）；服务端按用户、项目、当前集加载权威文本。若保留本地兜底，key 必须含用户/项目/集并同时校验三者，禁止全局 fallback。

4. **没有严格的 Scene/Shot 分析接口，现有聊天解析会静默失败并覆盖人工编辑。**
   - 现象：仓库没有 `/api/storyboard/analyze`；现有 `/api/production/storyboard-chat` 用正则提取任意 JSON 数组，无 Schema 校验，失败返回空数组；成功后前端用返回数组替换全部 Shot。
   - 来源：`app/api/production/storyboard-chat/route.ts:50-107`、`components/production/ProductionWorkbench.tsx:271-287`。
   - 后果：缺字段、错误类型和幻觉 ID 可直接进入状态；单场重分析可能静默覆盖锁定 Shot、用户修改和已生成图片。
   - 修复：新增严格 JSON Schema 的 analyze 接口；解析失败必须返回可见错误且不改当前态。重分析先创建快照并返回 merge proposal，只允许更新目标 Scene，锁定/人工编辑 Shot 默认保留。

5. **Shot 图片没有引用已选物料，也没有稳定版本绑定和幂等保护。**
   - 现象：生成接口固定传 `referenceUrls: []`，结果只把原始 `image_url` 写回 Shot；提示词构造未解析 `characterRefs`/`sceneRefs`，也没有 prop 引用；重复请求会重复提交生成。
   - 来源：`app/api/production/generate-shot-image/route.ts:47-87`、`lib/production/prompts.ts:35-63`。
   - 后果：角色、场景、道具主参考无法真正约束画面；主参考切换或 URL 变化后无法追溯生成输入；批量重试可能重复计费和产生重复任务。
   - 修复：客户端只提交 Shot ID 和幂等键；服务端加载当前 Shot 与已选 `storyflow_art_asset_versions`，解析私有存储引用后调用 Provider。保存 `referenceVersionIds + inputHash + storyboardImageVersionId`，并用唯一幂等键复用已有任务。

## MUST FIX

1. **统一最小数据模型，禁止继续扩展旧 `storyboard-workbench` 模型。**
   - Scene 至少包含：`id, order, heading, location, timeOfDay, summary, sourceText/sourceRange, characterAssetIds, propAssetIds, shots`。
   - Shot 至少包含：`id, sceneId, order, sourceText, storyBeat, visualDescription, characterAssetIds, sceneAssetId, propAssetIds, shotSize, cameraMovement, angle, durationSeconds, dialogue, emotion, continuity, imagePrompt, jimengPromptZh, jimengPromptEn?, confirmed, locked, userEdited, storyboardImageVersionId?, revision`。
   - `durationSeconds` 必须为数字；人工状态、选中参考版本、分析版本和 `sourceHash` 必须持久化。旧页的空行/句号切分和 `Date.now() + Math.random()` ID 不得进入新主链。

2. **固定两个服务端契约。**
   - `POST /api/storyboard/analyze` 请求至少包含 `projectId, episodeId/sourceUnitId, source, aspectRatio, targetDurationSeconds, visualStyle, outputLanguage, mode, sceneId?, expectedRevision, idempotencyKey`；响应包含 `analysisId, analysisVersion, sourceHash, revision, scenes, assets`。
   - `POST /api/storyboard/prompts` 请求至少包含 `projectId, episodeId/sourceUnitId, analysisVersion, shotIds, language, expectedRevision, idempotencyKey`；服务端读取权威 Shot 与选中物料版本，响应逐 Shot 返回 `imagePrompt, jimengVideoPrompt, negativePrompt, referenceVersionIds, inputHash`。
   - 任一 Shot 失败不得清空其他 Shot 的既有提示词；响应落地前必须再次校验 revision/input hash，避免慢请求覆盖新编辑。

3. **明确保存和版本策略。**
   - 当前态唯一键为 `(owner_id, project_id, episode_id/source_unit_id)`，并有单调递增 `revision`。
   - 自动保存按上述作用域 debounce；本地草稿 key 至少为 `kiikis:storyboard:v1:<user-or-anon>:<projectId>:<episodeId>`，不得再使用全局 `kiikis_production_workbench_state`。
   - 重新分析前、手动快照时先写 `storyflow_versions`；恢复版本也必须走 revision 检查。页面初始化应优先加载当前云端态，不只在版本恢复后加载。

4. **复用现有美术物料表，不另建重复资产系统。**
   - `storyflow_art_assets` 已覆盖 `character / scene / prop`，`storyflow_art_asset_variants` 与 `storyflow_art_asset_versions` 可承载四图候选和主参考。
   - 需补当前集的物料使用关系，并以 `approved_version_id`（或等价稳定版本 ID）绑定 Shot；不要只保存外链 URL。

5. **修正现有数据库契约冲突并收紧访问面。**
   - TypeScript 支持 `assembly/casting` mode，但数据库约束只允许 `planning/canvas/editor`（`supabase/migrations/20260716120000_production_storyboard_backend.sql:20-21`）；在纳入保存前必须对齐。
   - Production 表的授权需要显式检查 table/function grants，并让 RLS policy 明确面向 `authenticated`；service-role 路由仍必须在每次请求内校验用户、项目和集的归属，不能只依赖中间件。

6. **阶段 B 必须有针对性测试。**
   - 覆盖：首次保存回传稳定 ID、二次保存 ID 不变、插入失败不丢旧 Shot、乱序 autosave 返回 409、跨项目/跨集 handoff 被拒、结构化响应缺字段失败、重分析保留 locked/userEdited Shot、同幂等键只创建一个图片任务、提示词绑定正确物料版本、单 Shot 失败不清空其他结果。

## 可以继续

1. 继续以统一的 `ProductionWorkbench` 为单页基础，按 PRD 收敛成“剧本输入 / 分镜表 / 美术物料 / 分镜与即梦提示词”四区；无需再建无限画布或另一套工作台。旧 `/storyboard-workbench` 后续只做迁移入口或重定向。

2. 继续复用现有 `/api/files/parse` 处理 TXT / MD / DOC / DOCX / PDF，以及现有 Art Provider Adapter；这两部分不需要为第一阶段重写。

3. 继续复用 `storyflow_art_assets`、variants、versions 和 `storyflow_versions`，但按上述稳定 ID、当前集作用域、快照时机和引用版本规则接入。

4. 继续保持 Route Handler 内部重新认证和资源归属校验；AI/Provider 失败时保留当前客户端数据并显示可重试错误，不能用空数组或空字段清场。

5. 内部生产导出可以与 Formal Export 分开：本阶段的提示词包/分镜包可走明确标记的 Internal Preview/Production Export，现有合规能力保留，但不得把正式导出的 fail-closed 规则改回 fail-open。

6. TRAE/Kimi 可在 BLOCKER 1–5 的共同契约下并行推进。出现首个可运行 commit 后进入阶段 B Diff Review；在真实 1–2 分钟剧本全链路证据齐备前，不给最终 PASS。
