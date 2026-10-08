# 美术工作台聊天生图升级

用户已批准先实施并查看上线效果。保留现有资产编辑器和历史数据，默认 9:16，维持深色青绿界面。

## Global Constraints

- 新 Work 不自动导入旧项目/集缓存；仓库和详情必须使用相同的用户、项目、Work 或独立 draft 作用域。
- 未完成身份和草稿加载不得新增可点击的资产；不得将加载中显示为不存在。
- 所有新云端数据按已认证用户隔离，不进行删除、数据库迁移或修改他人数据。
- 默认 9:16；参考图仅使用本人 Storage 路径，模型按配置、权限、图生图能力筛选。
- 新生成是候选版本，不覆盖已锁定终稿；失败保留输入和参考图。

## Task 1: 云端草稿、生成任务和原图下载

写入范围：lib/art/cloud-store.ts，app/api/art/draft/route.ts，app/api/art/jobs/[jobId]/route.ts，app/api/art/download/route.ts，app/api/art/models/route.ts，app/api/art/generate-image/route.ts，tests/art-cloud-store.test.mjs。

先写行为测试并观察失败。复用 private art-assets Storage 存 JSON，不新增数据库表。草稿 scope 请求 `{projectId,workId}` 或 `{draftId}`；用户由 authenticateRequest 决定。服务端路径 `<userId>/workbench/<encoded-scope>/draft.json`，任务同目录 jobs/<jobId>.json。GET draft 返回 `{success,draft}`，PUT `{...scope,draft}` 写完整草稿；draft 包含 state/messages/jobs（前端定义）且有长度限制。GET jobs/{jobId}?scope 返回 `{success,job}`。只读取本人作用域。

generate-image 支持额外 `scope` 和 `jobId`：生成前持久化 running，生成成功后持久化 completed 和所有图片结果，失败持久化 failed。已有未带 scope/jobId 客户端兼容；重复同 jobId 不重新付费生成，返回已有状态/结果；过期 running 状态明确标注失败，不能自动重试付费。返回 result `jobId`。参考 Storage paths 服务端校验并重签，支持 `referencePaths`。不接受任意路径跳出作用域。

download POST `{storagePath,name}` 验证本人路径，从 Storage 获取原图字节，返回 attachment，不能仅给外部下载链接。models GET 认证后仅返回实际已配置且有权访问的模型目录，配置值不出响应。测试覆盖 owner、scope、任务重复和错误，下载路由安全。不自行 commit/push；主代理统一提交。

## Task 2: 草稿生命周期和首次新增

主代理执行。移除自动 legacy 恢复，保留恢复工具及旧数据。拆开 auth 和 hydration effect；新独立草稿先写入新 key 再激活。新增先持久化后显示；详情加载态直到身份/本地/云端加载完成；返回保留 workId。异步结果只回写开始时的作用域。测试冷加载和项目切换。

## Task 3: 聊天生图与可收起仓库

主代理执行。聊天携带有限历史、资料、风格；AI 明确返回生成计划，不声称已经生成。落实 create_variant/attach_upload/confirmation 反馈。 composer 上拉菜单、9:16 画幅和候选数，上传多图，生成结果卡预览/原图下载/作为参考/进入资产编辑。任务 id 保存，刷新能查询恢复；失败保留输入参考。右仓库收起，聊天占满，移动端无横向溢出。

## Task 4: 验证与发布

新增行为测试、真实浏览器 workflow 与截图；完整 Node 测试、类型检查和构建。审查边界及并发。只 stage 本次文件，push main，等待 Vercel 对应提交 Ready；公开页面和受保护 API 烟测。真实服务验收若凭证失败必须明确报告。记录已验证状态到 Obsidian 受控区。
