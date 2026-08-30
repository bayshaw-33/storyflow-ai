# Kiikis P1 实施计划

## Task 1：冻结契约与失败测试

- [x] 增加 local overlay 服务测试：owner、snapshot membership、CAS、幂等 Proposal。
- [x] 增加社区 reuse capability 测试：none/owned/granted/offer。
- [x] 增加 personal feed cursor 与 UI 契约测试。
- [x] 运行测试确认先失败。

## Task 2：Work Local Overlay 服务与 API

- [x] 新增 `lib/server/v2/inheritance/local-states.ts`。
- [x] 新增 `/api/v2/works/[workId]/local-states` GET/POST/PATCH。
- [x] 新增 `/api/v2/works/[workId]/local-states/[stateId]/propose` POST。
- [x] 在 Universe owner 对象区复用现有卡片和弹层接入保存、CAS 与 Proposal 确认。
- [x] 运行 focused tests 并提交。

## Task 3：社区真实授权能力与 Work Reuse

- [x] 服务端批量解析 publication 的 owner/grant/offer 能力。
- [x] 删除通用 `apply_use` 假能力；投影返回真实 capability。
- [x] 新增 publication reuse-context / reuse API，复用 `WorkUsageService`。
- [x] 详情页复用动作根据 capability 展示，目标 Work 选择后才执行。
- [x] Asset 仅在 active Offer 下进入 Marketplace。
- [x] 运行 focused tests 并提交。

## Task 4：真实个人 Feed 分页

- [x] 增加 `community_personal_feed` 数据库 RPC，Follow/Bookmark 在数据库中过滤。
- [x] `/api/v2/community/feed` 支持 following/saved cursor。
- [x] `DiscoveryFeed` 删除 100/200 固定加载和客户端拼接。
- [x] 去重追加并验证 cursor 边界。
- [x] 运行 focused tests 与 migration contract test 并提交。

## Task 5：评论、通知分页与关键双语

- [x] 评论和通知 UI 增加分页追加及加载更多。
- [x] Universe local overlay、Canon Proposal、社区 reuse 文案接入 `useI18n`。
- [x] 保持现有 DOM 容器和 CSS grid，不调整制作工作台。
- [x] 运行 focused tests 并提交。

## Task 6：总验证与交付

- [x] P0 + P1 focused regression。
- [x] `pnpm exec tsc --noEmit`。
- [x] `pnpm build`。
- [x] 比对四个冻结布局文件与 `origin/main`。
- [ ] 合并 `main`、应用 Supabase migration、推送 GitHub、验证 Vercel production。
