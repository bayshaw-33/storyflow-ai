# Coze 验收遗留修复 · 2026-08-28

## 修复范围

1. 演员市场：等浏览器会话恢复后再读取市场，使用统一认证重试。请求序号和取消信号防止旧的匿名 401 覆盖登录后的成功结果。
2. KK：初次 503 不再永久停止轮询；恢复后清除连接错误。HTTP 补拉显示“任务自动更新中”，不宣称已建立 WebSocket。旧消息保留实际时间，终态任务不继续累计等待时间。
3. 已购列表：生产库缺少 `storyflow_actor_orders`，并非认证失效。定向补齐读路径及 owner RLS；前端错误不再同时显示“暂无已购”，支持重新加载。

## 数据库

生产项目：`vgcafbzksizlwmylphzu`（StoryFlow）。

已执行 `20260828080000_verification_runtime_dependencies.sql`，并在同一事务记录迁移版本。执行前进行了完整事务回滚演练和权限断言。

新增必要依赖：actor orders、KK profiles、entitlement ledger、creative events，以及运行时需要的读取/追加 RPC。客户端不能自发放成长值或权益。没有启用演员交易写入、收益结算、抽卡、装备或里程碑系统。

仓库有两个同为 `20260827000000` 的旧迁移，且生产并未部署完整 2.1 迁移链。本次不运行全量 `db push`，也不把未执行的旧迁移虚报为已应用。后续全量迁移需先整理版本与依赖。

## 历史音频修复

- `9e912983-1a03-437c-b2ab-18911fb05dba`：从已有音频及已有资产记录恢复完成，138413 bytes，8.532 秒。
- `0454e757-1853-4fd4-ad33-c5f43f936c68`：同上，126881 bytes，7.812 秒。
- 两份 MP3 均从生产私有存储读取并经 macOS 音频解析器验证，未重新调用生成模型、未增加生成费用。
- 5 条已确认失败的历史测试音频以 `result_metadata.archivedAt` 可恢复归档。原状态、错误和记录均保留，不是删除或改成假成功。
- 报告称有 6 条声音失败，生产查询实际找到 5 条终态失败音频；没有据此删除其他类型的任务或尚未确认结束的排队任务。

归档不会从默认任务中心/KK 消息列表继续弹出。原详情接口仍可读，带 `includeArchived=true` 的 `/api/v2/jobs` 可查询归档历史。清除目标行的 `archivedAt`、`archiveReason` 和 `originalStatus` 三个 metadata 键即可取消归档；保留其他 metadata，不删除行。

操作脚本：`scripts/ops/recover-coze-audio.mjs`，默认只读预览，`--apply` 执行；固定生产目标、账号和 7 个任务 ID。凭证只在内存中使用，不写日志或仓库。脚本可重跑，已处理记录会跳过。

## 自动化证据

```sh
node --test tests/coze-report-stability.test.mjs tests/ui-v2/kk/kk-runtime-auth.test.mjs tests/server-v2/jobs/jobs.test.mjs tests/ui-v2/kk/kk-task-projection.test.mjs tests/audio-route-contract.test.mjs
npm run build
```

66/66 通过，生产构建通过。市场迟到 401、KK 初次故障后的自动恢复、终态计时和归档历史读取均有回归覆盖。

生产数据库修复后，现有已登录浏览器的 `/actors/purchased` 已显示正常的已购空列表，无接口错误。

## Coze 复验

- 使用本次部署对应 Git SHA，不以旧的本地 checkout 判断测试是否缺失。
- 已登录访问 `/actors`，市场有数据且无“请先登录”横幅；刷新/切换排序后仍一致。
- `/actors/purchased` 显示正常列表或真实空列表，不跳回登录，不出现“读取已购列表失败”。
- KK 面板显示任务自动更新；临时失败后可自行恢复，不再永久卡在 paused。
- 两个恢复任务显示完成；5 个已归档失败音频不再出现在默认列表；原始详情/历史可追溯。
- 正常未完成任务和非本次确认的其他历史失败不伪装成功、不擅自删除。
