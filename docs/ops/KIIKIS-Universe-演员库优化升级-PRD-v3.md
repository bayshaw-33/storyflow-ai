# KIIKIS Universe 与演员库优化升级 PRD

> 版本：v3.0
>
> 日期：2026-07-18
>
> 产品目标：把 Universe 与演员库从“字段展示页”升级为可供内部短剧生产长期使用的 IP 资产系统
>
> 主执行：TRAE
>
> 最终审查与小范围修复：Codex
>
> 优先级：P0 / P1
>
> 基线：`main@cf0bf44`
>
> 参考报告：`docs/ops/universe-actors-优化方案-v2.md`

---

## 1. 产品结论

本轮不是简单增加缩略图、搜索框或 Tab，而是统一解决以下四类问题：

1. 列表页误把完整项目说明书当成卡片简介，破坏信息层级和布局；
2. Universe、作品、角色、场景、道具之间缺少可用的关联数据；
3. Actor、Character、Portrayal 概念混用，演员身份与作品内角色形象无法清晰追溯；
4. 当前数据缺列、断链、重复 Universe 和开放 RLS 使新 UI 无法形成可信生产链。

统一产品原则：

> **列表用于选择，详情用于理解，资产区用于管理，完整长文只在文档阅读器中出现。**

本 PRD 完成后，用户应当能够：

```text
项目
→ 进入或创建 Universe
→ 查看该 Universe 的作品、角色、地点、道具和 Canon
→ 打开作品查看作品实际使用的角色/场景/道具版本
→ 查看角色由哪个 Actor 扮演
→ 查看 Actor 在不同作品中的 Portrayal
→ 从任何卡片进入资产详情或对应制作工作台
```

---

## 2. 范围

### 2.1 本轮必须完成

- Universe 列表信息架构重构；
- Universe 卡片摘要、封面和计数契约；
- Universe 详情收敛为 5 个主区域；
- 角色、地点、道具、组织的图片优先资产浏览；
- Universe 与作品的可靠关联和回填；
- 作品内角色、场景、道具的缩略图穿透；
- Actor 模特公司式列表；
- Actor 身份档案、图像包和参演作品详情；
- Actor / Character / Portrayal 三层关系；
- 列表与详情聚合 API；
- 缺失 migration、RLS 和错误处理止血；
- 真实项目数据验证、移动端和导出验证。

### 2.2 本轮明确不做

- 对外演员交易市场；
- 自动选角推荐系统；
- 商用授权计费；
- 社交关注、点赞、评论；
- 复杂多人审批流；
- 视频生成链路重构；
- Evidence Center 扩建；
- 无限画布式 Universe 编辑器；
- 物理删除 Universe 或用户创作数据。

---

## 3. 核心领域模型

### 3.1 定义

#### Universe

IP 世界观的唯一真源，保存跨作品继承的 Canon、实体、关系和时间线。

#### Work

Universe 下的具体作品，例如小说、剧本、短剧、季、衍生剧或本地化版本。当前实现以 `storyflow_projects` 和 `storyflow_universe_project_links` 为权威来源。

#### Canon Entity

Universe 级实体，包括：

- Character；
- Location；
- Object / Prop；
- Organization；
- Rule / Concept。

#### Actor

可以跨作品复用的虚拟演员身份，保存稳定脸部、体型、气质、基础 Prompt、身份参考图和授权状态。

#### Portrayal

Actor 在某个 Work 中扮演某个 Character 时的作品级形象，包括角色名、妆造、服装、发型和参考图片版本。

### 3.2 关系

```text
Universe
├─ Canon Entity
│  ├─ Character
│  ├─ Location
│  ├─ Object / Prop
│  └─ Organization
├─ Work
│  ├─ Production Shot
│  └─ Work-specific Asset Version
└─ Canon / Relationship / Timeline / Inbox

Actor
└─ Portrayal
   ├─ Character
   ├─ Work
   └─ Work-specific visual versions
```

### 3.3 强制约束

- Actor 不是 Character；
- Character 不是 Portrayal；
- 同一 Actor 可以在多个 Work 中扮演不同 Character；
- 同一 Character 可以在不同 Work/版本中有多个 Portrayal；
- Universe Canon 资产不得被某个 Work 的临时变体反向覆盖；
- 所有关联必须保存稳定 ID，不以图片 URL、名称或数组位置作为身份；
- 所有正式图片必须先持久化，再作为主缩略图或导出素材使用。

---

## 4. 信息展示规则

### 4.1 各页面展示边界

| 页面 | 必须展示 | 禁止展示 |
|---|---|---|
| Universe 列表 | 封面、名称、一句话摘要、标签、作品/角色/地点数量、待处理数、更新时间 | 完整 description、Markdown、Prompt、原始 ID |
| Universe 概览 | 核心设定、代表资产、作品预览、最近变化、待处理事项 | 数万字设定正文直接铺开 |
| Universe 资产 | 图片、名称、类型、Canon 状态、作品使用情况、更新时间 | 临时 URL、原始 JSON |
| Work 列表 | 封面、标题、角色、状态、资产计数、更新时间 | 角色/场景/道具长字符串拼接 |
| Actor 列表 | 白底头像、姓名、2–3 个标签、状态、参演数 | 完整人物设定和 Prompt |
| Actor 详情 | 身份档案、图像包、Portrayal、版本状态 | 裸 project ID、默认展开的长 Prompt |
| Inbox | 变更摘要、来源、置信度、接受/拒绝 | `proposed_payload` 原始 JSON `<pre>` |

### 4.2 文本长度

- Universe 卡片 `cardSummary`：中文最多 60 字，英文最多 160 字；前端最多 2 行；
- Work 卡片简介：最多 2 行；
- Entity 卡片摘要：最多 2 行；
- Actor 标签：最多显示 3 个；
- 所有 Markdown 标记在卡片层必须清除，不得显示 `#`、`**`、`>` 等原始符号；
- 完整 Universe Bible 使用独立阅读抽屉或文档页。

### 4.3 图片比例

- Universe / Work 封面：16:9；
- Actor 头像：3:4，白底正面特写；
- Character / Location / Prop 卡片：4:3；
- 图像容器固定比例，不得因图片尺寸改变卡片高度；
- 移动端姓名和状态不得依赖 hover 才出现。

### 4.4 缩略图选择优先级

#### Universe

```text
人工指定封面
→ 已批准的代表场景资产
→ 精选角色/场景拼图
→ 类型化占位图
```

#### Work

```text
人工指定项目封面
→ 已确认首镜图
→ 已选场景资产
→ 类型化占位图
```

#### Entity / Actor / Portrayal

```text
人工选中的主版本
→ approved 版本
→ 最新 completed 且已持久化版本
→ 类型化占位图
```

禁止直接使用 Atlas、DeepSeek 或其他 Provider 的临时 URL 作为长期缩略图。

---

## 5. Universe 列表页

### 5.1 页面顺序

```text
紧凑标题栏
搜索 / 筛选 / 排序 / 新建 Universe
卡片视图 ⇄ 关系图视图
Universe 卡片列表
```

以下内容从常驻页面移除，只在首次空状态或帮助抽屉出现：

- Live asset status；
- What belongs in Universe；
- How Universe is born；
- 重复的 Preview/营销说明；
- Source Projects 独立长列表。

### 5.2 筛选和排序

必须支持：

- 按名称和 `cardSummary` 搜索；
- 按状态筛选；
- 按类型/市场标签筛选；
- 按最近更新、名称、作品数排序；
- 卡片视图和关系图视图切换；
- 用户选择保留在当前浏览器会话。

不得对完整 `description` 做前端全文扫描。

### 5.3 Universe 卡片

固定展示：

- 16:9 封面；
- 名称；
- 状态；
- 最多 2 行 `cardSummary`；
- 最多 3 个标签；
- 作品、角色、地点计数；
- Pending Inbox 徽标；
- 更新时间。

操作：

- 点击卡片进入详情；
- 更多菜单提供编辑摘要、归档；
- 本轮不提供物理删除。

### 5.4 关系图

- 作为同一数据集的第二种浏览方式，不独占首屏；
- 节点必须显示 Universe 名称、作品数和角色数；
- 点击节点进入详情；
- 详情返回时恢复关系图视图和滚动位置；
- 无数据时显示明确空状态，不生成虚假节点。

---

## 6. Universe 详情页

### 6.1 主导航

现有主 Tab 收敛为：

1. 概览；
2. 资产；
3. 作品；
4. Canon；
5. 待处理。

映射规则：

- Characters、Locations、Props、Organizations 合并到“资产”二级筛选；
- Facts、Relationships、Timeline、Checks 合并到“Canon”二级筛选；
- Works 和 Projects 合并到“作品”；
- Inbox 保持独立并显示待处理数量；
- Export、设置、活动记录放入页面右上角操作菜单。

### 6.2 概览

必须展示：

- Universe 封面和 `cardSummary`；
- 类型、语言、目标市场；
- 作品、角色、地点、道具、Canon 数量；
- 代表角色/地点缩略图；
- 最近更新；
- Pending Inbox 与 Canon 冲突提醒；
- 关联作品预览；
- “查看完整 Universe Bible”入口。

禁止继续把完整 `description` 渲染为 `<h2>`。

### 6.3 资产

二级筛选：全部、角色、地点、道具、组织。

资产卡展示：

- 主缩略图；
- 名称；
- 一句话摘要；
- Canon / Draft / Alternative 状态；
- 被多少作品使用；
- 来源作品；
- 更新时间。

无图资产：

- 显示有类型辨识度的占位图；
- 显示“生成形象”或“进入美术工作台”；
- 生成按钮只有在端点和持久化链已接通时启用；
- 禁止用不可点击的假按钮。

### 6.4 作品

作品卡展示：

- 封面；
- 标题；
- `project_role`；
- 类型和制作状态；
- 集数或 Shot 数；
- 角色、场景、道具计数；
- 更新时间。

点击卡片打开侧边抽屉：

```text
主要角色：图片卡，前 6 个
核心场景：图片卡，前 6 个
关键道具：图片卡，前 6 个
查看更多
进入创作工作台
进入制作工作台
```

作品资产必须按 `owner_id + project_id` 查询；不得在客户端跨表全量拉取后拼接；不得只显示逗号分隔文本。

### 6.5 Canon

二级筛选：事实、关系、时间线、一致性检查。

- Canon Fact 显示内容、锁定状态、来源作品、最后更新时间；
- Relationship 使用卡片或小型关系视图，不展示裸 ID；
- Timeline 按时间排序并显示涉及实体；
- Canon Check 失败显式显示，不使用固定分数或静默启发式结果；
- 长技术数据进入详情抽屉。

### 6.6 待处理 Inbox

每个候选项展示：

- 将新增或修改的对象；
- 来源作品和原文片段；
- AI / fallback 来源；
- 置信度；
- 字段级变更摘要；
- 接受、编辑后接受、拒绝。

Fallback 提取结果必须带：

```json
{
  "degraded": true,
  "source": "fallback",
  "confidence": 0.3,
  "error": "可读错误信息"
}
```

不得把 raw JSON 作为主要用户界面。

---

## 7. Actor 演员库

### 7.1 列表页定位

视觉方向为“高端模特公司名册”，不是后台数据表。

卡片固定展示：

- 3:4 白底正面特写；
- 演员姓名；
- 最多 3 个气质/角色标签；
- Ready / Draft 状态；
- 参演作品数；
- Team / Private 标记。

姓名和状态在桌面、键盘焦点、触摸设备上都必须可见；hover 仅显示快捷操作。

页面必须有：

- 搜索；
- 状态筛选；
- 标签筛选；
- 最近更新/名称/参演数排序；
- 加载、空、错误三态；
- 文字创建和上传头像入口。

未知服务端错误不得伪装成空演员库。

### 7.2 演员详情页

#### 顶部身份区

- 主头像；
- 姓名；
- 状态；
- 可扮演类型；
- 身份资料完成度；
- 参演作品数；
- 最近更新；
- 编辑、归档、导出参考表。

#### 左侧身份档案

- 年龄感；
- 性别表达；
- 族裔/文化气质；
- 脸型与五官；
- 发型；
- 肤色；
- 体型；
- 气质与风格标签；
- 简介。

`base_prompt` 和 `negative_prompt` 默认折叠在“技术提示词”中，不得占据首屏。

#### 右侧图像资产

- 白底正面主头像；
- 白 T + 牛仔裤三视图；
- 泳装三视图；
- 表情组；
- 身体细节；
- 每张为独立持久化版本；
- 支持重新生成、选为主版本、查看历史版本；
- 支持合并导出标准角色参考表。

生成失败必须保留旧版本并显示可读错误，不得清空整个图组。

### 7.3 参演作品

Portrayal 卡展示：

- 作品封面或角色剧照；
- 作品标题；
- Universe 名称；
- Character 名称；
- 造型/服装方向；
- 形象版本；
- 可复用状态。

禁止向用户展示裸 `project_id`。

点击进入 Portrayal 详情或对应 Work，不直接跳到通用项目首页。

### 7.4 角色参考表导出

客户端合并导出固定 1920×1440 PNG：

- 左侧：主视觉和两张细节；
- 右侧：三视图、泳装三视图、表情网格；
- 缺失槽位使用明确占位，不拉伸其他图片；
- 图片读取失败显示错误，不生成伪完整文件；
- 所有源图必须为持久化且具备可读 CORS 的 URL；
- 下载文件名使用安全的演员名称。

---

## 8. 数据库与迁移

### 8.1 Actor schema 止血

必须先在 staging 执行并核验：

`supabase/migrations/20260718060000_actor_metadata_and_email_revoke.sql`

验证项：

- `storyflow_actor_profiles.metadata jsonb NOT NULL DEFAULT '{}'` 存在；
- `anon` 与 `PUBLIC` 不能执行 `get_user_id_by_email(text)`；
- actor 列表不再因未知列失败；
- 未知数据库错误仍返回非 2xx，不统一吞为 `actors: []`。

staging 通过并记录结果后，production 只执行同一份已验证 migration。

### 8.2 Universe 卡片字段

新增幂等 migration，为 `storyflow_universes` 增加：

- `card_summary text NOT NULL DEFAULT ''`；
- `cover_asset_version_id uuid NULL`；
- `archived_at timestamptz NULL`。

要求：

- `description` 保留完整 Universe Bible，不再用于列表；
- `card_summary` 是人工可编辑的短摘要；
- `cover_asset_version_id` 只能引用当前用户/团队可访问、已持久化的资产版本；
- 列表默认排除 `archived_at IS NOT NULL`；
- 归档可恢复，不物理删除。

如果当前资产表 FK 结构不允许安全建立外键，migration 中先保留 nullable UUID，并由服务端在写入时做 owner + version 校验；不得为绕过迁移而改存 URL。

### 8.3 Entity 主图

为 `storyflow_universe_entities` 增加：

- `primary_asset_version_id uuid NULL`。

写入时必须验证：

- entity 属于调用者可编辑的 Universe；
- asset version 属于同一 owner/team；
- version 状态为 completed/approved；
- 图片已经转存到平台管理的 Storage。

### 8.4 Actor / Character / Portrayal 安全边界

当前 `storyflow_casting_assignments` 与 `storyflow_character_portrayals` 的 RLS 使用 `USING (true)` / `WITH CHECK (true)`，属于 P0 权限风险。

TRAE 必须提供独立 migration：

- 为两张表补充稳定 `owner_id`，需要团队共享时补充 `team_id`；
- 从关联 project 或 actor profile 回填 owner；
- 对无法确认 owner 的历史行停止迁移并输出审计清单，不猜测归属；
- 删除开放策略；
- SELECT/INSERT/UPDATE/DELETE 按 owner 或 active team role 控制；
- editor 可编辑，viewer 只读；
- service role 仅在服务端使用；
- 添加 actor、character、project 查询索引；
- 添加跨 owner 访问回归测试。

不得以“接口已经鉴权”为理由保留开放 RLS。

### 8.5 Project link 修复

写入顺序必须为：

```text
确认项目存在并归属当前用户
→ 查 project_id 是否已有有效 Universe link
→ 有则复用原 Universe
→ 无则创建 Universe
→ 原子写入 project link
```

- link 失败必须整体失败，不得 `.catch(() => null)`；
- `(universe_id, project_id)` 唯一约束保留；
- 同一 project 只能有一个 active primary Universe link；
- 跨 owner/project link 返回 403；
- UI 不得在 link 失败时显示创建成功。

### 8.6 重复 Universe 治理

- 先生成只读审计报告：候选重复项、来源项目、实体数、作品数、最近更新时间；
- 不自动删除；
- 由用户选择保留的主 Universe；
- 合并时迁移 links、entities、Canon、timeline、inbox 和封面引用；
- 迁移完成并核验计数后，重复项只归档；
- 记录 merge manifest，支持人工回溯。

---

## 9. API 契约

### 9.1 Universe 列表聚合

```text
GET /api/universe/summaries
```

响应：

```json
{
  "universes": [
    {
      "id": "uuid",
      "name": "陨神之墓",
      "status": "active",
      "cardSummary": "年轻考古学家发现自己是雅典娜的人间容器。",
      "coverUrl": "signed-or-public-persisted-url",
      "tags": ["奇幻", "悬疑"],
      "workCount": 2,
      "characterCount": 12,
      "locationCount": 8,
      "pendingInboxCount": 3,
      "updatedAt": "ISO-8601"
    }
  ]
}
```

要求：

- 单次请求返回列表需要的完整 DTO；
- 不返回完整 description；
- 不发生按 Universe 的 N+1；
- owner/team 过滤在服务端完成；
- 失败返回明确非 2xx、稳定错误码和 request ID；
- 禁止捕获错误后返回 200 空对象。

### 9.2 Universe 详情聚合

```text
GET /api/universe/:universeId/overview
```

返回：

- Universe 短摘要与封面；
- 核心计数；
- 代表实体；
- 作品预览；
- 最近变化；
- Pending/Canon 冲突提示。

复杂跨表关联在服务端完成，前端不得直接读取多个 owner-scoped 表后拼接。

### 9.3 Work 资产聚合

```text
GET /api/universe/:universeId/works
GET /api/universe/:universeId/works/:projectId
```

列表接口返回 Work 卡片 DTO；详情接口返回角色、场景、道具缩略图列表。两者都必须同时校验 Universe access 和 project access。

### 9.4 Entity 主图选择

```text
PATCH /api/universe/:universeId/entities/:entityId/primary-asset
```

请求：

```json
{
  "assetVersionId": "uuid"
}
```

不得接受客户端直接提交最终图片 URL。

### 9.5 Actor 单条读取

```text
GET /api/actors/:actorId
```

演员详情页必须使用单条读取，不再请求整个演员列表后在客户端查找。

返回 Actor 身份档案、主图、图像包完成度和参演计数；Portrayal 列表仍可使用独立分页接口。

### 9.6 错误契约

统一结构：

```json
{
  "success": false,
  "error": "UNIVERSE_ACCESS_FORBIDDEN",
  "message": "没有访问该 Universe 的权限。",
  "requestId": "uuid"
}
```

- 401：未登录；
- 403：越权；
- 404：对象不存在或不可见；
- 409：重复 link、revision 或合并冲突；
- 422：字段非法；
- 502/503：外部 AI、Storage 或聚合依赖失败。

UI 在刷新失败时可以保留上一次成功数据并显示“可能已过期”，但不得把失败显示为真实的 0 条数据。

---

## 10. AI 与图片 Provider

- Universe 文本提取、Canon Check、摘要生成只走 DeepSeek；
- 演员头像、参考图、三视图、表情组、身体细节和 Universe 资产图只走 Atlas Cloud；
- `viral/_utils.ts` 的视频分析不在本轮范围；
- 所有 Key 只从服务端环境变量读取；
- 浏览器响应、日志、错误信息不得包含 Key；
- DeepSeek 失败时，extract 可使用明确标注的 degraded heuristic；
- Canon Check 失败必须显式报错，不能生成虚假固定评分；
- Atlas 生成成功后必须转存平台 Storage，再创建 asset version；
- Provider 临时 URL 过期或下载失败时，任务状态必须为 failed，不写入主缩略图。

### 10.1 cardSummary 回填

对现有长 description：

1. 优先读取用户已保存的 logline；
2. 没有 logline 时由 DeepSeek 生成候选摘要；
3. AI 失败时使用清理 Markdown 后的首个完整自然段，截断为长度上限，并标记 `summary_source=fallback`；
4. 用户可以编辑并确认；
5. 不覆盖原 description。

生产回填前先输出预览清单；不允许无审阅批量覆盖用户文本。

---

## 11. 状态与空态

所有列表/详情必须区分：

- Loading：骨架屏；
- Empty：真实查询成功但无数据；
- Error：查询失败，显示错误与重试；
- Stale：保留旧数据但刷新失败；
- Partial：部分聚合成功，明确标出缺失模块。

禁止：

- 把未知错误转换成空列表；
- 把接口失败显示为计数 0；
- 静默吞掉写入失败；
- 生成失败后清空已有图片；
- 为展示效果伪造生产数据。

浏览器 `ERR_ABORTED` 只有在同时取得请求 URL、HTTP 状态、request ID 和服务端日志后才作为后端缺陷处理。页面跳转主动取消请求不属于接口 P0。

---

## 12. TRAE 实施阶段

### 阶段 A：P0 数据与权限止血

交付：

- actor metadata migration staging/production 核验；
- casting/portrayal owner 字段和 RLS migration；
- project link 审计和修复；
- 重复 Universe 只读报告；
- `card_summary`、封面、entity 主图字段 migration；
- migration rollback 脚本；
- 权限和迁移测试。

完成标准：数据库不存在开放 portrayal/casting 写策略，演员列表可真实读取，现有项目可以追溯到 Universe。

### 阶段 B：聚合契约

交付：

- Universe 列表 DTO；
- Universe overview DTO；
- Work 列表和详情 DTO；
- Actor 单条读取；
- Entity 主图选择端点；
- 非 2xx 错误契约和 request ID；
- API 单元测试与 owner 隔离测试。

完成标准：页面不需要为每个 Universe 拉取多张表，不需要客户端跨表拼接作品资产。

### 阶段 C：Universe UI

交付：

- 列表页内容前置；
- 搜索、筛选、排序；
- 卡片/关系图双视图；
- 固定比例封面和两行摘要；
- 5 个详情主区域；
- Assets、Works、Canon、Inbox 二级信息架构；
- Universe Bible 阅读入口；
- 中英文同步；
- 375px、768px、1440px 响应式。

完成标准：任何长 description 都不会改变列表卡片高度或详情首屏布局。

### 阶段 D：Actor 与 Portrayal UI

交付：

- 模特公司式演员卡片墙；
- 触摸设备常驻姓名；
- 演员单条详情读取；
- 身份档案和折叠技术 Prompt；
- 图像包状态和历史版本；
- 参演作品卡；
- 标准参考表导出；
- 失败保留旧图。

完成标准：用户能从 Actor 找到全部 Portrayal，也能从作品中的 Character 找到对应 Actor。

### 阶段 E：真实数据与全链验收

使用一部真实短剧项目，不创建生产假数据，完成：

```text
已有项目 link 修复
→ Universe cardSummary 确认
→ 提取角色/地点/道具到 Inbox
→ 接受进入 Canon
→ 选择实体主图
→ 作品卡展开资产
→ Character 关联 Actor
→ 创建 Portrayal
→ 演员详情出现参演作品
→ 导出演员参考表
→ 刷新后全部恢复
```

---

## 13. 测试要求

### 13.1 数据与安全

- 非 owner/team member 读取 Universe 返回 403/404；
- 非成员不能读取作品资产；
- 非 owner/editor 不能修改主图；
- casting/portrayal 跨 owner SELECT/INSERT/UPDATE/DELETE 均被 RLS 拒绝；
- link 失败不留下孤立 Universe；
- 同一 project 重试不创建重复 Universe；
- 重复 Universe 合并前后各表计数一致；
- metadata migration 可重复执行；
- rollback 不删除用户创作数据。

### 13.2 API

- summaries 单请求返回完整卡片 DTO；
- summaries 失败返回非 2xx，不返回假空数据；
- description 不出现在列表 DTO；
- Work 详情严格按 Universe + project 双重授权；
- Actor 单读不能读取其他用户 private Actor；
- 临时图片 URL 不得写入主图字段；
- 错误响应包含 requestId。

### 13.3 UI

- 35,000 字 description 不改变卡片高度；
- 搜索、筛选、排序组合正确；
- 无封面时占位图比例稳定；
- Works 展开显示图片卡而非长字符串；
- Inbox 不展示 raw JSON；
- Actor 姓名在 375px 触摸布局始终可见；
- 图组单张失败不清空其他版本；
- CORS 失败时参考表导出显示错误；
- Loading、Empty、Error、Stale 不混用。

### 13.4 工程闸门

TRAE 每个阶段必须实测：

```bash
pnpm exec tsc --noEmit
node --test tests/*.test.mjs
pnpm build
```

UI 交付还必须提供：

- `/universes` 桌面与 375px 截图；
- Universe 详情 5 个主区域截图；
- `/actors` 列表和 Actor 详情截图；
- 真实作品展开资产截图；
- request ID 对应的错误态截图；
- 一段从 Universe 到 Actor/Portrayal 的操作录屏。

---

## 14. 最终验收标准

以下全部通过，才可判定 `PASS FOR INTERNAL PRODUCTION`：

1. Universe 列表首屏直接出现用户资产，不再先展示营销说明；
2. 卡片不显示完整项目介绍，所有卡片高度稳定；
3. 搜索、筛选、排序和关系图切换可用；
4. 每个 Universe 可看到作品、角色、地点和道具；
5. 每个 Character/Location 有缩略图或明确占位；
6. 作品展开后显示角色、场景、道具图片卡；
7. Universe 创建和升级不会产生重复 Universe；
8. 项目 link 失败不会显示假成功；
9. Actor 列表为白底正面特写卡片墙；
10. Actor 详情可看到完整身份档案和独立图像版本；
11. 参演作品显示作品名、Universe、Character 和造型，不显示裸 ID；
12. Actor / Character / Portrayal 可双向追溯；
13. 参考表可下载，缺图或 CORS 失败时不会生成伪完整文件；
14. 刷新后 Universe、主图、Portrayal 和图像包不丢失；
15. 所有 owner/team 隔离测试通过；
16. casting/portrayal 不存在 `USING (true)` 或 `WITH CHECK (true)` 开放策略；
17. 未知后端错误不会被伪装为空列表或 0 计数；
18. 全量 typecheck、tests、build 通过。

判定标准：

- `BLOCK`：存在越权、数据覆盖、断链、重复创建、RLS 开放或迁移失败；
- `PASS WITH MUST-FIX`：主链可用，但存在不导致数据损坏的体验或性能问题；
- `PASS FOR INTERNAL PRODUCTION`：上述 18 项全部通过。

---

## 15. TRAE 交接要求

TRAE 必须按阶段提交，禁止把全部内容压成一个大 commit。推荐提交顺序：

```text
1. migrations + RLS + tests
2. aggregate API contracts + tests
3. Universe list and detail IA
4. Actor and Portrayal experience
5. data repair tooling + end-to-end evidence
```

每个阶段交接必须包含：

- commit range；
- 修改文件清单；
- migration dry-run、执行与回滚记录；
- API 请求/响应样例；
- 测试结果；
- 实测截图或录屏；
- 未完成项和风险；
- 与本 PRD 的偏差及原因。

禁止实施：

- 未知错误统一返回空数组；
- summaries 失败返回 200 空对象；
- 使用生产假数据；
- 使用首个角色作为默认 Universe 封面；
- 直接删除重复 Universe；
- 把临时图片 URL 保存为正式资产；
- 在前端用 service role；
- 为赶进度保留开放 RLS。

---

## 16. Codex 完成后审查与修复

TRAE 完成后，Codex 依次执行：

1. 审查 migration、RLS、owner/team 隔离和回滚安全；
2. 核对列表 DTO 是否泄露完整 description、Prompt、临时 URL 或裸技术字段；
3. 检查 project link、Universe 去重和主图写入是否具备数据库级约束；
4. 实测 typecheck、全量 tests、build，不采信交接文档中的自报结果；
5. 使用真实项目走 Universe → Work → Entity → Actor → Portrayal 全链；
6. 复测 375px、键盘导航、错误态和参考表导出；
7. 输出 `BLOCK / PASS WITH MUST-FIX / PASS FOR INTERNAL PRODUCTION`；
8. 对边界明确、修改不超过 300 行的 Blocker/Must-Fix，由 Codex 直接修补并补测试；
9. 超过 300 行或涉及产品方向变化的问题，退回 TRAE 按独立任务卡处理。

---

## 17. 最终产品判断

本轮升级的成功标准不是“页面更漂亮”或“Tab 更多”，而是：

> 用户只看到当前决策所需要的信息，同时可以在需要时继续追溯到作品、角色、演员、图片版本和完整 Universe 文档；任何层级都不丢失身份、归属和来源。

---

## 18. TRAE 文件与测试边界

以下为本轮预计修改边界。新增文件可以按现有目录风格细分，但不得把 Universe、Actor 和 Portrayal 全部继续堆入单个页面文件。

### 18.1 Universe 页面与组件

- 修改 `app/universes/page.tsx`：列表页信息架构、查询状态和视图切换；
- 修改 `app/universes/[universeId]/page.tsx`：收敛为 5 个主区域，并将超大内部组件拆出；
- 修改 `components/universe/UniverseGraph.tsx`：视图切换、节点摘要和返回状态；
- 新增 `components/universe/UniverseCard.tsx`；
- 新增 `components/universe/UniverseOverview.tsx`；
- 新增 `components/universe/UniverseAssets.tsx`；
- 新增 `components/universe/UniverseWorks.tsx`；
- 新增 `components/universe/UniverseCanon.tsx`；
- 新增 `components/universe/UniverseInbox.tsx`；
- 新增 `components/universe/universe-view-model.ts`，只放纯展示模型和过滤/排序逻辑。

### 18.2 Universe 服务端

- 修改 `lib/universe.ts`：短摘要、主图和 project link 契约；
- 修改 `lib/universe/graph.ts`：使用列表 DTO 构建图，不读取完整 description；
- 修改 `app/api/universe/summaries/route.ts`：返回完整列表 DTO；
- 新增 `app/api/universe/[universeId]/overview/route.ts`；
- 新增 `app/api/universe/[universeId]/works/route.ts`；
- 新增 `app/api/universe/[universeId]/works/[projectId]/route.ts`；
- 新增 `app/api/universe/[universeId]/entities/[entityId]/primary-asset/route.ts`；
- 新增幂等 migration：Universe 卡片字段、Entity 主图和查询索引；
- 新增独立的 project link/重复 Universe 审计脚本，默认只读，写模式必须显式传目标 Universe。

### 18.3 Actor 与 Portrayal

- 修改 `app/actors/page.tsx`：搜索、筛选、排序和状态展示；
- 修改 `app/actors/[actorId]/page.tsx`：改用 Actor 单读、详情信息分层；
- 修改 `components/actors/ActorCard.tsx`：常驻身份条和状态；
- 修改 `components/actors/ActorProfilePanel.tsx`：技术 Prompt 折叠；
- 修改 `components/actors/ActorAssetPacks.tsx`：版本状态、单项错误和主版本；
- 修改 `components/actors/PortrayalGallery.tsx`：作品、Universe、Character 语义化展示；
- 修改 `components/actors/actor-view-model.ts`：Actor 与 Portrayal DTO；
- 新增 `app/api/actors/[actorId]/route.ts`；
- 修改 `app/api/actors/portrayals/route.ts`：返回语义化作品数据并实施 owner/team 隔离；
- 修改 `lib/supabase/actors.ts`：单条读取与安全查询；
- 新增 casting/portrayal owner 回填和 RLS migration。

### 18.4 测试文件

- 扩展 `tests/universe-links.test.mjs`：原子 link、复用、失败回滚和跨 owner；
- 新增 `tests/universe-summaries.test.mjs`：列表 DTO、无 description、无假空响应；
- 新增 `tests/universe-assets.test.mjs`：主图选择、持久化 URL 和 owner 隔离；
- 新增 `tests/universe-works.test.mjs`：作品与角色/场景/道具聚合；
- 新增 `tests/universe-library-ui.test.mjs`：截断、筛选、排序和空/错/旧数据状态；
- 扩展 `tests/actor-library-ui.test.mjs`：常驻姓名、参演语义和单读契约；
- 扩展 `tests/actor-images.test.mjs`：单图失败保留旧版本、临时 URL 拒绝；
- 新增 `tests/actor-portrayal-auth.test.mjs`：Actor/Character/Portrayal 跨 owner 与团队角色；
- 新增 `tests/universe-actor-e2e.test.mjs` 或等价 Playwright spec：真实链路正向与反向跳转。
