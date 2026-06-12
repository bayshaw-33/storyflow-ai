# StoryFlow 2.0 数据底座审计报告

## 已完成

1. 线上产品已部署到 Vercel，当前地址为 `https://storyflow-ai-drab.vercel.app/`。
2. 已有原创项目和剧本续写两类工作流，14 步流程保留。
3. 已完成第一版 Supabase 项目同步：本地项目 JSON 可同步到 `storyflow_projects`。
4. 已接入 DeepSeek / MiniMax provider router。
5. 已有本地版本历史、项目分组、项目删除、附件解析、角色卡、关系图和交付下载。

## 有问题

1. 第一版 Supabase schema 使用 anon 读写策略，不适合多用户 SaaS。
2. 旧版云项目没有 `user_id`，无法可靠判断归属。
3. AI API 原先未校验登录，存在匿名无限调用风险。
4. 生成记录原先只存在项目 JSON 和本地版本里，缺少服务端 generation task 追踪。
5. 额度、限流、失败返还规则原先缺失。
6. 多标签页冲突仍是弱处理，目前依赖 `updatedAt` 后写覆盖。

## 缺失

1. Supabase Auth 登录/注册。
2. 用户私有 RLS。
3. `generation_tasks` / `generations`。
4. `credits`。
5. 结构化 `project_steps`。
6. Story Bible、Diff、DramaScore 的独立结构化表。
7. Sentry 正式接入。
8. Storage 里的 assets / exports 正式上传链路。

## 建议保留

1. 保留 localStorage 作为未登录本地草稿和网络失败兜底。
2. 保留现有 14 步创作工作流，不重写页面。
3. 保留项目主数据 JSON，短期可以降低迁移成本。
4. 保留 MiniMax 图片失败后的本地 SVG 兜底，保证演示稳定。

## 建议重构

1. 把 14 步流程收纳到 5 阶段视图，但不要删除原步骤。
2. 把关键步骤逐步拆到 `storyflow_project_steps`，项目 JSON 作为缓存快照。
3. 生成任务统一通过 `/api/ai/generate` 和图片 API 进入 task/credit 系统。
4. 多标签冲突后续增加 `revision` 或 `updated_at` 条件更新。
5. 正式商业版需要从单用户项目升级到 organization/member 权限。

## 本轮处理

1. 新增 Supabase Auth 前端登录入口。
2. 项目同步改为未登录本地草稿、登录后云端同步。
3. AI 生成 API 增加登录校验、额度扣减、基础 rate limit。
4. 新增 `storyflow_generation_tasks` 和 `storyflow_generations` 写入逻辑。
5. 新增 `storyflow_credits` 读取和扣减逻辑。
6. 新增 2.0 Supabase schema。
7. 图片生成 API 纳入登录和额度校验。

