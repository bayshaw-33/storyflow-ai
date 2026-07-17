# 迁移初稿目录（PRD §13）

> **重要**：本目录的脚本为初稿，未经 Kimi/Codex 审核前**不得在生产运行**。
> 仅用于 dry-run、字段映射审查、orphan 数据评估和 rollback 方案确认。

## 文件清单

| 文件 | 用途 | 状态 |
|---|---|---|
| field-mapping.md | 旧字段 → 新表字段映射清单 | 初稿 |
| dry-run.sql | dry-run 检查脚本（只读，不修改数据） | 初稿 |
| orphan-report.sql | orphan 数据检测脚本 | 初稿 |
| rollback.sql | 回滚脚本（仅恢复结构，不保证数据完整性） | 初稿 |

## 执行边界

1. 上述脚本可在 **staging 环境** dry-run
2. 任何 **生产执行** 必须经过 Kimi/Codex 审核并签署
3. rollback.sql 仅作为应急方案，不替代完整备份
4. blob → 新表迁移未包含（需 Kimi 确认是否有 blob 字段需迁移）

## 审核流程

1. TRAE 提交初稿 → 本目录
2. Kimi 审核字段映射正确性
3. Codex 审核 SQL 安全性（RLS、权限、事务边界）
4. 审核通过后在 supabase/migrations/ 下创建带时间戳的正式 migration
5. 正式 migration 由专人在生产执行
