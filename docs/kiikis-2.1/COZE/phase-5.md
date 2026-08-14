# KIIKIS 2.1 Phase 5：COZE 验证计划

> 验证者：COZE（布朗）
> PRD 来源：§9 + §14 Gate 4
> TRAE 任务文件：`kiikis-2.1/TRAE/phase-5.md`

## 验证范围

Phase 5 交付物：IP 资产社区 — 发布发现 / 关注互动 / 评论通知 / 举报审核申诉。
**Gate 4 判定**：发现/关注/互动/通知/授权入口跑通，举报/屏蔽/审核/申诉/恢复跑通，无 P0/P1 安全隐私审核缺陷。

## 验证清单

### 1. Publication 发布与发现

#### 1.1 publication 与源资源分离 (CM-001)
- [ ] publication 保存源资源快照（resourceType, resourceId, version）
- [ ] 保存发布者 ID 和可见性
- [ ] 隐藏 publication 不删除私有源（关联 CM-008）
- [ ] 有测试验证：发布后源资源仍可编辑

#### 1.2 发现页投影查询 (CM-002)
- [ ] 发现页查询 publication 投影表，非私有资源表
- [ ] 只返回 public 或 invite_only（且有 token）的 publication
- [ ] 社区首屏不等待私有详情和计数全量聚合（§12.2 性能）
- [ ] 有测试验证：私有资源不出现

#### 1.3 关注/反应/收藏幂等 (CM-003)
- [ ] follow 唯一约束 (follower_id, target_type, target_id)
- [ ] reaction 唯一约束 (user_id, publication_id, reaction_type)
- [ ] bookmark 唯一约束 (user_id, publication_id)
- [ ] 重复操作幂等
- [ ] 有测试验证

#### 1.4 对象页来源与许可 (CM-005)
- [ ] 详情页显示源资源类型/ID、owner、许可状态、允许动作
- [ ] 不暴露私有 storage path 或敏感信息
- [ ] 有测试验证

### 2. 评论与通知

#### 2.1 评论功能 (CM-004)
- [ ] 评论锚定 publication_id + parent_comment_id（回复）
- [ ] 软删除：deleted_at 标记
- [ ] 冻结：frozen_by + frozen_reason
- [ ] 审核证据关联 moderation queue
- [ ] 有测试验证：回复层级、软删除、冻结

#### 2.2 通知 (CM-006)
- [ ] 通知由 creative_events 生成（复用 Phase 1）
- [ ] 通知类型：关注/评论/反应/申请使用/审核结果
- [ ] 通知可读、已读、去重
- [ ] 有测试验证

### 3. 安全与审核

#### 3.1 举报 (CM-007)
- [ ] report 记录原因类型和描述
- [ ] 举报进入 moderation queue
- [ ] 有测试验证

#### 3.2 屏蔽 (CM-007)
- [ ] block: user → user，屏蔽后互相不可见
- [ ] 有测试验证

#### 3.3 审核流程 (CM-007)
- [ ] moderation queue 审核员可查看
- [ ] 操作：隐藏/恢复/驳回
- [ ] 隐藏 publication → visibility=hidden
- [ ] 恢复 → hidden → public
- [ ] 有测试验证：report → review → hide → appeal → restore 完整流程

#### 3.4 申诉 (CM-007)
- [ ] 被处罚用户可提交申诉
- [ ] 审核员处理申诉（批准/驳回）
- [ ] 有测试验证

#### 3.5 隐藏不删除私有源 (CM-008)
- [ ] 隐藏 publication 只改可见性
- [ ] 源 Project/Universe/Asset 不受影响
- [ ] 有测试验证

#### 3.6 权限矩阵 (CM-009)
- [ ] 匿名用户：只能浏览 public
- [ ] 普通用户：浏览 + 互动
- [ ] 被屏蔽用户：看不到屏蔽者内容
- [ ] 审核员：moderation queue + 隐藏/恢复/驳回
- [ ] RLS + 应用层双重校验
- [ ] 有测试验证：4 种角色

#### 3.7 Feature flag 保护 (CM-010)
- [ ] /community 受 feature flag 保护
- [ ] Gate 4 未通过前非邀请用户重定向或占位
- [ ] 有测试验证

### 4. 文件边界核验
- [ ] 未修改共享文件
- [ ] 未修改 Phase 0-4 已交付文件
- [ ] feature-flags.ts 未修改
- [ ] 新建文件在合理目录内

### 5. 测试核验
- [ ] publication 发布/发现测试
- [ ] 关注/反应/收藏幂等测试
- [ ] 评论回复/软删除/冻结测试
- [ ] 通知生成/去重测试
- [ ] 举报/屏蔽/审核/申诉全流程测试
- [ ] 权限矩阵测试（4 种角色）
- [ ] feature flag 保护测试
- [ ] 现有测试不回归

### 6. Gate 4 核验

**Gate 4：社区安全运营**
- [ ] 发现、关注、互动、通知和授权入口跑通
- [ ] 举报、屏蔽、审核、申诉、恢复跑通
- [ ] 无未解决 P0/P1 安全、隐私或审核缺陷

### 7. 综合判定

- [ ] Publication 发布与发现完整（CM-001~003, 005）
- [ ] 评论与通知完整（CM-004, 006）
- [ ] 安全与审核完整（CM-007~010）
- [ ] **Phase 5 验证 PASS / FAIL**
- [ ] **Gate 4 PASS / FAIL**
