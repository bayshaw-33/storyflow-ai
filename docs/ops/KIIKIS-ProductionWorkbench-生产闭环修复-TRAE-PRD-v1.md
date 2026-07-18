# KIIKIS 制作工作台生产闭环修复 PRD

> 版本：v1.0  
> 日期：2026-07-18  
> 优先级：P0  
> 主执行：TRAE  
> 验收与小范围修复：Codex  
> 工程基线：`main@8fcf9ec`  
> 线上审查基线：`d31ce7e` 之后的最新 production deployment

---

## 1. 唯一目标

本轮只解决“功能已经铺开，但用户无法完成一集”的生产闭环问题。

完成后，登录用户必须能在 production 用一集 1–2 分钟真实短剧剧本完成：

```text
进入制作工作台
→ 上传或带入剧本
→ DeepSeek 分析 Scene / Shot
→ DeepSeek 不可用时由 Atlas Cloud Gemini 接管
→ 保存并获得稳定作用域和稳定 Shot ID
→ 创建/选择人物、场景、道具参考
→ 生成并确认分镜图
→ Atlas 生成单 Shot 视频和批量视频
→ 刷新、关闭页面、重新进入后完整恢复
→ 下载完整生产包
→ 下载制作证据包
```

最终验收不以测试数量或 build 成功为完成标准，唯一产品标准是：

> **同一登录用户在 production 真正完成一集，并在重新进入后继续工作和导出。**

---

## 2. 本轮冻结项

### 2.1 工作台布局冻结

本轮禁止调整：

- 制作工作台四个 Tab 的顺序、名称和页面骨架；
- 分镜表布局、列结构和 Shot 编辑交互；
- 全局导航布局；
- Universe 列表布局；
- Actor 列表和详情视觉设计；
- 工作台配色、字号、卡片样式和整体信息架构；
- 新建独立工作台、无限画布或新的合规中心。

允许的 UI 改动仅限于完成主链所需的最小功能控件和错误状态，例如：

- 在现有归档弹窗中增加 Universe / 项目 / 集的绑定选择；
- 在现有通知区域显示自动保存、降级 Provider、转存失败和部分导出失败；
- 修复按钮禁用条件、链接上下文和错误文案；
- 在现有剧本区内补齐已存在契约需要的画幅、时长、风格、语言输入，不改变区块布局。

### 2.2 其他非目标

- 不重做 Universe 和演员库产品设计；
- 不自动删除、合并或改名 production 中现有的 6 个 Universe；
- 不自动批量回填不确定的作品关系；
- 不重建 Evidence Center；
- 不引入配音、剪辑、计费或外部协作；
- 不再新增 MiniMax 依赖；
- 不用大规模重构替代明确补丁。

---

## 3. 当前工程事实

TRAE 开工前必须以本节为准，不得按旧审查报告重复施工。

### 3.1 已关闭，不再重做

| 旧问题 | 当前事实 | 本轮要求 |
|---|---|---|
| Universe 页面读取 `payload.summaries` | `8fcf9ec` 已读取 `payload.universes` | 只做回归验证，不改布局 |
| Universe 首页长筛选栏和关系图挤占首屏 | `8fcf9ec` 已只保留紧凑搜索、统计和卡片墙 | 冻结，不再修改 |
| `storyflow_actor_profiles.metadata` 等迁移缺失 | actor metadata、Universe card、casting/portrayal RLS、`prop_refs` 已在 staging 和 production 应用 | 禁止盲目重跑，只核验 Schema 和真实 API |
| `expectedRevision: null` 绕过 CAS | 已关闭，路由级 400 测试已存在 | 保持回归，不重写保存 RPC |
| 视频幂等只在应用层 | production 已有 `(owner_id, idempotency_hash)` 部分唯一索引 | 验证真实冲突路径，不重复建索引 |
| Evidence 后端缺失 | production 已有 Evidence 表、RPC、私有 bucket 和现有下载入口 | 修复可达性并做真实下载，不扩建中心 |

### 3.2 当前仍成立的 P0

1. `storyboard_script` 在 hybrid 路由中仍默认选择 MiniMax；
2. `setup=1` 每次生成新时间戳草稿 ID，却未写回 URL；
3. 本地草稿加载完成前可能被空初始态自动保存覆盖；
4. 云端 state 只恢复 Scene / Shot，制作资产、来源和生成结果仍可能只在本地；
5. 嵌入美术台使用 project scoped storage key，但资产详情仍读取全局 key，且卡片链接丢失作用域；
6. `/api/actors` 需要在真实 production 登录态确认 200 空列表和真实创建，不得用“数据库不可用”掩盖未知列错误；
7. Atlas 视频转存失败仍会被写成 `completed` 并持久化 Provider 临时 URL；
8. 视频 signed URL 过期后没有基于 `storage_path` 的服务端重签路径；
9. 当前分镜 ZIP 缺 `script.txt`、`assets/`、`storyboard-images/` 和完整清单；
10. 当前 production 没有可用于验收的 Production Project / Shot / Actor / Universe Project Link 样本。

---

## 4. 权威作用域与数据原则

### 4.1 唯一制作作用域

所有四区必须共享同一对象：

```ts
type ProductionScope = {
  ownerId: string;
  universeId: string | null;
  projectId: string;
  sourceUnitId: string;
  revision: number;
};
```

规则：

- `ownerId` 只来自服务端认证；
- `projectId + sourceUnitId` 必须同时存在并写入 URL；
- `universeId` 可以在未归档草稿阶段为空，但归档时必须明确选择“绑定现有 Universe / 创建 Universe / 暂不归属”；
- `revision` 只由服务端 CAS 保存返回；
- 剧本、Scene、Shot、Asset、Frame、Video Job、Export 和 Evidence 全部使用同一作用域；
- 不得以名称、图片 URL、数组下标或当前 Tab 推断归属；
- 不得在嵌入美术台中再创建第二个隐式项目作用域。

### 4.2 资产身份链

所有正式资产必须可追溯：

```text
Universe（可空）
→ Project
→ Source Unit / Episode
→ Entity / Shot
→ Asset
→ Variant
→ Version
→ Storage Path
→ Provider + Model + Input Hash
→ 使用记录 / Evidence Event
```

长期状态只保存稳定 ID 和私有 Storage 路径。Provider 临时 URL 只允许存在于一次转存函数的内存中，不得进入数据库、导出包、Evidence、前端 localStorage 或日志。

---

## 5. TRAE-PW-P0-001：剧本分析 Provider 修复

### 5.1 目标

`storyboard_script` 文本分析链固定为：

```text
DeepSeek primary
→ Atlas Cloud Gemini fallback
→ 两者都失败时显式失败
```

任何情况下不得回落到 MiniMax。

### 5.2 实现要求

1. 为 storyboard 创建窄 Provider chain，不要把整个全局 Provider Router 大改；
2. DeepSeek 保留现有 system prompt、user prompt、temperature 和严格 JSON 解析；
3. 新增 Atlas Cloud LLM Adapter，使用官方 OpenAI-compatible 接口：

```text
POST https://api.atlascloud.ai/v1/chat/completions
Authorization: Bearer $ATLASCLOUD_API_KEY
```

4. Atlas Gemini 模型只从服务端环境变量读取：

```text
ATLASCLOUD_LLM_BASE_URL=https://api.atlascloud.ai/v1
ATLASCLOUD_LLM_MODEL=<Atlas 账户当前可用的 Gemini 精确 model id>
```

5. 禁止新增 `NEXT_PUBLIC_*` Provider 变量，禁止把 key、请求正文或完整 Provider 原始响应写日志；
6. fallback 仅允许执行一次；
7. 下列情况触发 Atlas Gemini fallback：
   - DeepSeek key 缺失；
   - 超时、网络失败、429、5xx；
   - DeepSeek 返回空内容；
   - DeepSeek 输出无法通过 storyboard 严格 Schema；
8. 4xx 输入错误、未认证、跨作用域、revision 冲突不得触发 Provider fallback；
9. Atlas 输出也必须通过同一严格 Schema；
10. 两个 Provider 都因网络、限额、超时或配置不可用时返回显式 502；Atlas 最终返回内容但仍无法通过 Schema 时返回 422；两种情况都不得返回空 Scene/Shot 或覆盖页面当前数据；
11. 响应增加非敏感诊断：

```json
{
  "provider": "deepseek|atlas",
  "model": "server-selected-model",
  "fallbackUsed": false,
  "analysisId": "uuid"
}
```

12. 不向客户端返回 key、base URL、Provider request ID 或原始错误正文。

Atlas LLM 接口依据：[Atlas Cloud LLM 官方文档](https://www.atlascloud.ai/docs/en/models/llm)。

### 5.3 验收

- DeepSeek 成功时只调用 DeepSeek；
- DeepSeek 429 时只 fallback 一次到 Atlas Gemini；
- DeepSeek invalid JSON 时 Atlas 合法 JSON 能成功；
- 两者都失败时页面保留已有 Scene/Shot，并显示可重试错误；
- 测试能证明 MiniMax mock 从未被调用；
- production 实际 analyze 响应不再出现 MiniMax 429。

---

## 6. TRAE-PW-P0-002：稳定草稿身份与恢复

### 6.1 新草稿 URL 规范化

用户通过 `/production?setup=1&mode=...` 进入时：

1. 只生成一次 `draftProjectId` 和 `draftSourceUnitId`；
2. 使用 `crypto.randomUUID()`，不得用两个不同的 `Date.now()`；
3. 立即通过 `router.replace` 写回 URL；
4. 保留 `mode` 和已有 `universeId`；
5. 删除 `setup=1`，避免 effect 再次初始化；
6. URL 规范化完成后才允许加载、自动保存或发起 AI 请求。

示例：

```text
/production?mode=planning
  &projectId=draft-production-<uuid>
  &sourceUnitId=draft-unit-<uuid>
  &universeId=<optional-uuid>
```

### 6.2 恢复与自动保存顺序

增加明确 hydration 状态：

```text
resolving_scope
→ loading_local
→ loading_cloud_if_archived
→ ready
→ autosave_enabled
```

在 `ready` 前禁止把空初始 state 写入 localStorage 或云端。

必须恢复：

- 原始剧本文本；
- 上传文件名和提取文本；
- Scene / Shot；
- AI 提取的人物、场景、道具；
- 选中的资产版本 ID；
- 分镜图 version ID；
- 视频 job 状态；
- revision；
- 画幅、目标时长、视觉风格和输出语言。

localStorage 写入失败必须在现有通知区域显示错误，不得空 catch。

### 6.3 云端与本地优先级

- 草稿未归档：稳定 URL + scoped local draft 是当前态；
- 已归档：服务端 revision 是权威当前态，本地只作为未提交恢复副本；
- 云端加载完成后不得用更旧 local revision 覆盖；
- 409 继续使用现有“刷新 / 另存快照”，不得恢复 `expectedRevision:null`；
- 跨 `projectId` 或跨 `sourceUnitId` 不得读取任何旧草稿或美术数据。

### 6.4 验收

- 新建草稿后刷新，URL ID 不变化；
- 复制 URL、关闭页面、重新打开，数据完整恢复；
- 同一项目两集互不串数据；
- 两个项目使用同名角色也不串资产；
- 初始化期间不会出现“先恢复后被空状态清零”；
- 乱序 autosave 仍返回 409；
- 首次保存后 Shot ID 稳定，第二次保存 ID 不变。

---

## 7. TRAE-PW-P0-003：演员 API 与美术资产身份修复

### 7.1 演员 API

production 迁移已经完成，本任务禁止先写新 migration 规避问题。

必须：

1. 核验 `/api/actors` 在登录且 0 行时返回 `200 { actors: [] }`；
2. 若仍为 400，记录真实错误码并修复查询、字段或 RLS 根因；
3. `PGRST204` 等未知列错误不得被转成“云端服务不可用”的伪降级；
4. 创建一个验收演员后，刷新列表仍可见；
5. 演员详情、主头像、generate-views 和 portrayals 必须 owner scoped；
6. 真实创建流程不得把 API key、内部 Storage path 或 Supabase service role 返回浏览器。

### 7.2 嵌入美术台与资产详情

当前根因是：嵌入美术台按 `contextProjectId` 使用 scoped storage key，但资产卡跳转没有携带 scope，详情页继续读取全局 `kiikis_art_workbench_state`。

修复要求：

1. 资产卡详情链接必须携带 `projectId + sourceUnitId`；
2. 详情页使用与嵌入工作台完全相同的 scoped key；
3. `ArtWorkbench` 增加 `contextSourceUnitId`，scope 不能只有 project；
4. 已归档项目优先从服务端读取 asset / variant / version；
5. 未归档草稿可用 scoped local state，但归档时必须把资产持久化到云端并回传稳定 ID；
6. 卡片列表可见的资产，点击详情不得出现“找不到资产”；
7. 详情保存后返回工作台，修改必须仍在同一项目同一集可见；
8. 图片正式成为候选/主参考前必须转存私有 Storage；
9. 生成失败显式显示，不能插入空版本或伪 ready 状态。

### 7.3 验收

- production 创建一个真实演员并刷新恢复；
- 生成/上传演员主头像后能生成至少一个 views pack；
- 制作草稿创建人物、场景、道具各一个，逐个打开详情成功；
- 选为主参考后刷新仍保持相同 version ID；
- 从项目 A 的 asset URL 修改成项目 B scope 时返回 404/403，不泄露资产；
- 浏览器和数据库均不保存 Provider 临时图片 URL。

---

## 8. TRAE-PW-P0-004：四区作用域与归档绑定

本任务修数据流，不改工作台布局。

### 8.1 四区共享上下文

- Script、Art、Storyboard、Video 必须从同一个 `ProductionScope` Provider/Hook 读取作用域；
- 嵌入 ArtWorkbench 时隐藏或禁用其独立项目创建/切换能力；
- 所有 API 请求必须携带同一个 `projectId + sourceUnitId`；
- UI 不显示 raw UUID，调试信息仅在开发环境；
- 无合法 scope 时生成、保存、导出和证据按钮 fail-closed。

### 8.2 归档语义

现有归档弹窗允许做最小扩展，但不得重排工作台页面。

归档必须支持：

```text
A. 绑定已有 Universe + 已有 Project + 当前 Episode
B. 绑定已有 Universe + 创建新 Project + 创建 Episode 1
C. 创建新 Universe + 创建新 Project + 创建 Episode 1
D. 暂不归属 Universe + 创建新 Project + 创建 Episode 1
```

要求：

- 选择已有 Project 时不得再次创建重复 Project；
- 创建 Project 后先确认 `storyflow_projects` 成功，再写 `storyflow_universe_project_links`；
- link 写失败时归档返回失败，不得 `.catch(() => null)`；
- 相同 owner + project 已有关联时复用，不创建重复 Universe；
- 草稿到正式 Project 的 ID 映射只发生一次；
- 归档成功后 URL 原地 replace 为正式 `projectId + sourceUnitId`；
- Scene、Shot、Asset、Frame 和 Video Job 继续留在原页面且不丢失；
- 用户选择“暂不归属”时允许生产，但必须在 project metadata 明确 `universe_link_state: unassigned`，不得假装已沉淀。

### 8.3 验收

- 绑定已有 Project 不新增 project row；
- 绑定 Universe 后 Universe 作品数增加且能打开该作品；
- link 写入失败时页面保留草稿和全部数据；
- 归档后现有制作证据包按钮立即可用；
- 归档前后 Shot ID 和 asset version ID 不变化或有完整 `idMap` 对账。

---

## 9. TRAE-PW-P0-005：Atlas 视频安全完成态

### 9.1 状态机

视频只有在以下步骤全部成功后才能 `completed`：

```text
Provider done
→ 下载 Provider 临时 URL
→ 校验非空 bytes 和受支持 Content-Type
→ 上传 private storyboard-videos
→ 保存 storage_path
→ 生成短期 signed URL
→ 原子更新 job completed
→ 记录 Evidence event
```

任一步失败：

- `result_url = null`；
- 不保存 `providerTempUrl`；
- 使用现有状态集合中的 `result_ingesting`、`partial_failure` 或 `failed`，不得误用 `completed`；
- `error` 保存可展示但不含临时 URL、key 或完整 Provider 响应；
- 用户可重试“转存”，不重复创建 Provider 生成任务；
- 同一 idempotency hash 仍只对应一个有效 job。

### 9.2 签名 URL 重签

- 数据库权威字段为 `storage_path`，不是 `result_url`；
- GET job、刷新恢复和导出访问 completed 视频时，服务端根据 `storage_path` 重新签发短期 URL；
- 过期 signed URL 不得让 job 变成失败，也不得要求重新生成视频；
- 客户端不得自行拼 Storage URL。

### 9.3 验收

- Provider download 失败：job 非 completed、无可播放 URL、可重试；
- Storage upload 失败：同上；
- Storage sign 失败：对象已上传时允许重签重试，不重复调用 Atlas；
- signed URL 过期后刷新可重新播放；
- 同一 Shot 连点两次只产生一个数据库 job；
- batch 重复提交不重复计费；
- confirmed first frame 必须由服务端从权威 version 解析，客户端 URL 不被信任；
- production 真实生成单 Shot、批量至少 2 Shot、失败重试各完成一次。

---

## 10. TRAE-PW-P0-006：完整生产包导出

### 10.1 ZIP 固定结构

```text
<project>-<episode>-production-package.zip
├─ script.txt
├─ storyboard.json
├─ shot-list.csv
├─ jimeng-prompts.md
├─ manifest.json
├─ README.md
├─ assets/
│  ├─ characters/
│  ├─ locations/
│  └─ props/
├─ storyboard-images/
└─ videos/
```

### 10.2 内容要求

- `script.txt`：当前 episode 的原始剧本文本；
- `storyboard.json`：Scene、Shot、revision、稳定 ID、引用的 asset version ID；
- `shot-list.csv`：一行一个 Shot；
- `jimeng-prompts.md`：按 Shot 排列的可复制提示词；
- `assets/`：只放当前集实际引用的已选主参考版本；
- `storyboard-images/`：当前集已确认分镜图；
- `videos/`：当前集 completed 且已转存的视频；
- `manifest.json`：每个期望文件的相对路径、类型、来源稳定 ID、SHA-256、状态；
- `README.md`：项目名、集、revision、生成时间、包含数和失败数。

### 10.3 失败处理

- 下载任一资产失败时必须把整体结果标为 `partial_failure`；
- 导出完成前展示缺失文件清单，并要求用户确认下载不完整包或重试；
- 禁止把 Provider URL 和“下载失败 URL”写入 `.failed.txt`；
- manifest 中失败项只写稳定 ID、错误码和状态；
- 不能把 HTTP 404/403 响应体当图片或视频写进 ZIP；
- 所有 signed URL 必须由服务端即时签发；
- ZIP 下载后必须可解压且所有 manifest hash 可重新计算通过。

### 10.4 验收

- 有脚本、3 类资产、分镜图和视频的真实项目导出后目录齐全；
- 模拟一张图片签名过期会先重签并成功；
- 模拟一个对象永久缺失会明确显示 partial failure；
- 两次导出不因 signed URL 不同而改变稳定内容身份；
- ZIP 内不存在 `http://`、`https://api.atlascloud.ai` 或 Provider 临时域名。

---

## 11. TRAE-PW-P0-007：无感留痕与证据包可达性

不新增页面，不扩建合规中心，继续使用现有：

```text
制作工作台 → 导出 → 下载制作证据包
```

必须保证：

1. 草稿归档为正式项目后，按钮无需刷新即可变为可用；
2. 正常保存、快照、AI 分析、主参考确认、分镜图完成、视频完成和生产包导出写入幂等 Evidence event；
3. 留痕失败不得回滚已成功的用户创作，但必须在响应与 UI 明确显示 `evidenceSynced:false`；
4. 证据包只从服务端权威事件和已持久化文件生成；
5. 用户无需上传相同参考图两次；
6. 证据包使用私有短期签名 URL；
7. 未登录、跨 owner、草稿态均 fail-closed；
8. 证据包下载失败时显示服务端错误，不得静默；
9. 本轮不增加法律结论、登记或正式确权承诺文案。

验收：

- production 完成真实项目保存后可一键下载证据包；
- ZIP 可解压，事件链 hash 校验通过；
- Evidence timeline 能对应本次真实分析、保存、图像、视频和导出；
- 跨用户请求返回 404/403，不泄露项目是否存在。

---

## 12. API 契约补充

### 12.1 Analyze

保持现有请求契约，不接受客户端 Provider 选择：

```text
POST /api/storyboard/analyze
```

成功：200；输入或 AI Schema 不合法：422；Provider 都不可用：502；revision 冲突：409。

AI 输出不合法时，当前页面数据必须保持不变。

### 12.2 State

```text
GET /api/storyboard/state?projectId=&sourceUnitId=
PUT /api/storyboard/state
POST /api/storyboard/snapshots
```

- `PUT expectedRevision` 只能是非负整数；
- `null`、缺失、字符串、负数返回 400；
- Snapshot 永不写当前态；
- State 响应需要能恢复本 PRD 第 6.2 节列出的权威字段，或提供同作用域聚合恢复 API；
- 不允许用多个无顺序客户端请求拼成一个“看似恢复”的页面。

### 12.3 Asset detail

若沿用页面路由，URL 至少携带：

```text
/art-workbench/assets/:assetId?projectId=&sourceUnitId=
```

服务端读取必须同时校验 owner、project、source unit 和 asset ID。

### 12.4 Job

```text
POST /api/storyboard/shots/:shotId/generate-video
GET /api/storyboard/jobs/:jobId
POST /api/storyboard/jobs/:jobId/retry-transfer
```

允许把 retry-transfer 做成 GET job 的内部幂等动作，但必须有专项测试证明它不会再次提交 Atlas generation。

---

## 13. Migration 与环境纪律

### 13.1 默认结论

本轮预计不需要新 migration。下列结构已经在 production：

- actor metadata；
- Universe card fields；
- casting / portrayal owner-team RLS；
- production shot `prop_refs`；
- video `idempotency_hash`、`storage_path`、唯一索引和私有 bucket；
- Evidence schema、RPC 和 private bucket。

### 13.2 若 TRAE 认为必须新增 migration

必须先提交：

- 只读 Schema 证据；
- migration SQL；
- rollback SQL；
- 影响表、锁风险、预计行数；
- staging 执行和回滚重放结果。

TRAE 不得自行：

- `db push --include-all` 到 production；
- 修改 production migration history 迁就本地；
- 批量删除重复 Universe；
- 批量回填不确定的 project link；
- 开放 RLS 或给 authenticated 写 generation job 权限。

是否执行新 production migration 由 Codex 在最终审查时根据实际 SQL 决定。

---

## 14. 测试要求

### 14.1 必须新增或扩展的专项测试

1. `storyboard-ai-routing`：DeepSeek primary、Atlas Gemini fallback、MiniMax zero-call、双失败；
2. `production-draft-recovery`：URL 固定、hydration gate、刷新恢复、跨集隔离；
3. `art-asset-scope`：scoped link、详情读取、跨项目拒绝、归档持久化；
4. `actors-production-smoke`：0 行 200、创建、刷新、views；
5. `storyboard-video-transfer`：download/upload/sign 失败、retry、re-sign、数据库幂等；
6. `production-export-package`：固定目录、hash、partial failure、无 Provider URL；
7. `evidence-production-flow`：归档后可用、事件链、下载、跨 owner；
8. `production-scope`：四区同一 project/sourceUnit，归档关联 Universe。

### 14.2 全量工程闸门

```bash
pnpm exec tsc --noEmit
node --test tests/*.test.mjs
pnpm run build
```

不得通过删除旧测试、降低断言或用本地 SVG/空数组伪成功换绿。

### 14.3 浏览器 E2E

至少覆盖：

- TXT 上传；
- DeepSeek 正常分析；
- 注入 DeepSeek 失败后的 Atlas fallback；
- Scene/Shot 编辑与保存；
- 刷新和关闭重开；
- 演员创建；
- 三类美术资产创建和详情；
- 分镜图确认；
- 单视频、批量、失败重试；
- 生产包下载；
- 证据包下载；
- Universe 作品关联可见。

E2E fixture 可以使用脱敏剧本，但最终 production 验收必须使用一集真实内部短剧剧本。

---

## 15. TRAE 提交顺序

TRAE 按以下顺序小步提交，不等待 Codex 中途批准，但每个 commit 必须独立可回滚：

```text
Commit 1  fix(ai): route storyboard analysis through DeepSeek and Atlas Gemini
Commit 2  fix(draft): canonicalize production draft scope and hydrate safely
Commit 3  fix(assets): persist actor and scoped art asset identities
Commit 4  fix(scope): bind production tabs and archive flow to one scope
Commit 5  fix(video): fail closed on artifact transfer and re-sign storage URLs
Commit 6  fix(export): build complete production and evidence packages
Commit 7  test(production): add real-flow E2E and handoff evidence
```

若实际实现需要拆分，可增加 commit，但不得把布局改版混入任何 commit。

---

## 16. TRAE 交付清单

交付时必须提供：

- 基线和完整 commit range；
- 每个 commit 的目的；
- 修改文件清单；
- 新增环境变量名，不含值；
- 是否新增 migration；
- tsc、全量 tests、build 原始摘要；
- Playwright 测试文件和结果；
- staging / production deployment URL 和 commit；
- 真实验收项目的非敏感作用域说明；
- DeepSeek 实际成功证据；
- Atlas Gemini fallback 实际成功证据；
- Atlas 图片、视频和 Storage 转存证据；
- 生产包与证据包的文件清单和 hash 校验摘要；
- 所有已知失败、降级或未验证项。

禁止把 API key、完整剧本、用户 PII、Provider 临时 URL 或 service role 日志放入交接。

---

## 17. Codex 统一验收

TRAE 全部推送部署后，Codex 按以下顺序复查并对边界明确的小问题直接修复：

### 17.1 安全复查

- key 只在 server env；
- storyboard 无 MiniMax fallback；
- owner/project/sourceUnit 隔离；
- CAS 和 Snapshot 边界；
- generation job 数据库幂等；
- Provider 临时 URL 零持久化；
- Storage 私有、短签名、可重签；
- Evidence fail-closed；
- RLS 和 service role 边界。

### 17.2 真实全链

```text
Dashboard
→ 制作工作台
→ 真实剧本
→ AI Scene/Shot
→ 保存
→ 人物/场景/道具
→ 分镜图
→ 单 Shot Atlas 视频
→ 批量
→ 失败重试
→ 刷新/关闭重开
→ Universe 作品可见
→ 完整生产包
→ 制作证据包
```

### 17.3 结论

- `PASS FOR INTERNAL PRODUCTION`：完整链通过，无数据丢失、越权、伪成功或临时 URL；
- `PASS WITH MUST-FIX`：主链可完成，但存在非安全、非数据损失的明确缺口；
- `BLOCK`：任一安全问题、串项目/串集、数据丢失、AI 主链不可用、视频伪 completed、导出缺核心文件或证据包不可下载。

---

## 18. Definition of Done

以下 18 项必须全部满足：

1. `storyboard_script` DeepSeek primary；
2. DeepSeek 失败时 Atlas Cloud Gemini fallback；
3. MiniMax 在该链零调用；
4. 新草稿 URL 有稳定 project/sourceUnit ID；
5. 刷新和关闭重开后数据完整；
6. 首次、二次保存 Shot ID 不变化；
7. 409 不覆盖云端新版本；
8. `/api/actors` production 登录态正常；
9. 创建演员后刷新仍可见；
10. 三类美术资产详情均可打开；
11. 四区共享同一作用域；
12. 归档不重复创建 Project/Universe；
13. Atlas 视频只有转存成功才 completed；
14. 视频 signed URL 过期可重签；
15. 批量重复提交不重复计费；
16. 生产包包含 script、assets、storyboard images 和 videos；
17. 制作证据包可一键下载并通过 hash 校验；
18. production 用一集真实剧本走完全链。

任一项未完成，TRAE 不得使用“Alpha 已交付”或“内部可用”作为结论。
