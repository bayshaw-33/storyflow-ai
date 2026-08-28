# Kiikis Community C0/C1/C2 交付报告

## 范围

- C0 社区发现页：推荐、关注、Universe、作品、演员与声音、素材、收藏分区。
- C1：游标搜索、Universe 社区页、真实数据降级/不可用状态。
- 本轮补齐 Coze 验收指出的四类缺口：卡片上下文、六类语义对象、作品真实入口、通知跳转目标。
- C2：评论/回复、通知中心、真实创作回流入口和对应验证。

## 实现结果

### 1. 卡片上下文与诚实降级

- 卡片和详情页展示来源工作台、权利摘要、贡献摘要。
- 缺少权利信息时显示“权利状态未声明”；缺少贡献记录时显示“暂无贡献记录”。
- 没有真实源对象入口时使用禁用控件，并通过 title 说明原因，不伪装成可点击链接。
- Work 类型根据真实 `work_type` 显示对应工作台；未知类型保留“作品工作台”降级。

### 2. 六类内容对象

- 产品语义层支持 `work`、`universe`、`actor`、`asset`、`milestone`、`kk_showcase` 六类对象。
- `milestone` 和 `kk_showcase` 是 publication 的语义分类，不伪造不存在的资源表。
- 数据库真实 `source_type` 仍保持 `project`、`episode`、`scene`、`universe`、`actor`、`asset`，未扩展为语义类型。
- 新迁移 `20260828100000_community_card_context.sql` 仅新增上下文字段、索引和语义校验，并回填稳定的 Project → Work 关系。

### 3. 作品真实入口

- episode/scene 发布记录先解析真实 `project_id`，再解析真实 `storyflow_works.id/work_type`。
- 作品卡片复用现有 `resolveWorkbenchRoute`，按 Work 类型进入统一生产工作台或既有专用工作台，不再生成第二套路由。
- 缺少真实 Work 上下文时，入口明确禁用。
- 旧数据库尚未执行迁移时，feed 查询自动回退旧字段，社区首页不会因新列不存在而整体 503。

### 4. 通知跳转链路

- 社区通知和协作通知统一支持 `linkUrl`、`sourceUrl`。
- 写入通知时保存 `link_url/source_url`；publication 没有显式 link 时自动生成社区详情链接。
- 当前 `/api/v2/notifications` 使用的 collab 消费端已透传两个跳转字段，兼容历史通知 payload。

### 5. C2 互动与创作回流闭环

- 新增 `/api/v2/community/notifications`，当前登录用户可读取社区通知、标记单条已读或全部已读。
- publication 详情页新增评论/回复面板，评论软删除后保留位置并隐藏正文；提交要求客户端稳定幂等键，重试不会按时间戳重复创建。
- 社区首页新增通知入口，覆盖加载、空、失败重试、未读、已读和跳转状态；不注入 fixture 通知。
- 详情页新增“继续创作”区域：Use 仅进入真实 source 路由，Remix/License 没有真实授权能力时显示“暂不可用”和原因，不伪装成已完成。
- 卡片新增回到真实 publication 详情的“继续创作”入口。

## 实现偏差说明

任务单要求的六类对象不能直接等同为六种数据库 `source_type`。为保护现有存储契约，本实现采用“真实 source_type + 产品 subject_type”的两层模型：卡片按 subject_type 展示产品语义，真实关系仍由 source_type 和 Work 关系解析。这样不会破坏既有 publication、评论、通知和资源表。

## 提交批次

- `5fe14f0d` `feat(community): rebuild community shell with real states and unified publication card`
- `14d88287` `feat(community): add universe community detail and cursor-paginated feed/search APIs`
- `0bec5d08` `test(community): cover C0/C1 acceptance contracts`
- `4812aa2b` `fix(community): expose honest card rights and contribution context`
- `8fb123ce` `fix(community): add semantic publication subject layer`
- `3a289f99` `fix(community): resolve publication cards to real Work routes`
- `fix(community): preserve notification publication and source links`
- `80161b40` `docs(community): define C2 interaction loop`
- `2aa4fc69` `docs(community): plan C2 interaction loop`
- `a33b8475` `test(community): define C2 interaction contracts`
- `948a497c` `feat(community): expose notification API and safe comment retries`
- `fcc242ce` `feat(community): add publication comments and replies`
- `f9129d95` `feat(community): add notification center`
- `da8b0318` `feat(community): connect honest creation return actions`

## 验证

最终验收命令：

```text
node --test tests/community-v20-*.test.mjs tests/community-v21-*.test.mjs tests/community-c22-acceptance-gaps.test.mjs
pnpm exec tsc --noEmit
pnpm run build
```

基线验收测试已覆盖：32 项社区 C0/C1 与缺口契约测试，全部通过；C2 聚焦回归另有 45 项通过。

- `pnpm exec tsc --noEmit`：通过。
- `pnpm run build`：通过，生成 84 个页面并包含社区、Universe 社区、评论和通知 API 路由。
- 构建仍报告 1 个非阻断孤立资产 token：`LOGO_PRIMARY`；资产完整性检查通过。
- C2 聚焦回归：45 项通过。
- C2 Playwright：`e2e/community-c22-object-loop.spec.ts` 仅在配置两个真实账号 storageState 和真实 publication 后执行；未配置时跳过，不以 fixture 冒充验收。
- C2 无新增生产数据库迁移；沿用已应用的 `20260828100000_community_card_context.sql`。

## 交付边界

- C0/C1 合并后，C2 工作现场位于 `/private/tmp/kiikis-storyflow-c2`，未修改 canonical checkout。
- 本 C2 分支不合并 main，不执行 force push、reset --hard 或 git clean。
- 未在报告或代码中写入账号、API key 等凭证。
