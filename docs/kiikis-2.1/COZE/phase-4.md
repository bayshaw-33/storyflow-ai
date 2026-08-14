# KIIKIS 2.1 Phase 4：COZE 验证计划

> 验证者：COZE（布朗）
> PRD 来源：§7 + §8 + §14 Gate 3
> TRAE 任务文件：`kiikis-2.1/TRAE/phase-4.md`

## 验证范围

Phase 4 交付物：资源出生即权利 + 项目级轻协作。
**Gate 3 判定**：创建后即可邀请/分享/使用/授权，grant/RLS 矩阵通过，撤销保留历史。

## 验证清单

### 1. 资源权利核验

#### 1.1 owner 服务端决定 (RG-001)
- [ ] 资源创建时 owner_id 由服务端写入
- [ ] 客户端传入 owner_id 被忽略
- [ ] 有测试验证

#### 1.2 邀请 token (RG-002)
- [ ] token 哈希存储（不存明文）
- [ ] 单次使用（accepted 后不可再用）
- [ ] 限时过期
- [ ] 接受后绑定账号
- [ ] 有测试验证过期/已用/哈希安全

#### 1.3 grant + RLS 双重校验 (RG-003)
- [ ] 所有资源读取先 RLS 再 grant 检查
- [ ] checkGrant 函数实现
- [ ] 无 grant 用户被拒绝
- [ ] 有 grant 用户通过
- [ ] 有测试验证

#### 1.4 撤销保留历史 (RG-004)
- [ ] revoke → status=revoked，不删除记录
- [ ] 历史使用、来源、审计事实保留
- [ ] 有测试验证

#### 1.5 衍生物权利 (RG-005)
- [ ] adaptation 记录 source grant terms 快照
- [ ] source grant 撤销后已生成衍生物权利不变
- [ ] 有测试验证

#### 1.6 所有权转移 (RG-006)
- [ ] 转移需双方确认
- [ ] 记录前后 owner
- [ ] 单方发起不生效
- [ ] 有测试验证

### 2. 项目协作核验

#### 2.1 角色体系 (CO-001)
- [ ] owner/editor/reviewer/viewer/asset_operator 角色定义
- [ ] 角色绑定到 project/universe 范围
- [ ] 权限矩阵测试

#### 2.2 任务指派 (CO-002)
- [ ] 指派给有 grant 的成员
- [ ] 无 grant 用户不可被指派
- [ ] 有测试验证

#### 2.3 评论锚定 (CO-003)
- [ ] 评论锚定 resourceType + resourceId + version
- [ ] 不锚定数组下标
- [ ] 有测试验证

#### 2.4 审阅流程 (CO-004)
- [ ] pending → in_review → approved/rejected
- [ ] 审阅记录完整
- [ ] 有测试验证

#### 2.5 批准/驳回 (CO-005)
- [ ] 记录原因和审阅人
- [ ] 驳回可带修改建议
- [ ] 有测试验证

#### 2.6 活动轨迹 (CO-006)
- [ ] 项目级活动流
- [ ] 活动锚定 resourceType + resourceId
- [ ] 有测试验证

#### 2.7 通知 (CO-007)
- [ ] 重要事件触发通知
- [ ] 通知可读、已读、去重
- [ ] 复用 Phase 1 creative_events
- [ ] 有测试验证

#### 2.8 个人账号所有权根 (CO-008)
- [ ] 无企业组织层级
- [ ] 个人账号始终是最终 owner
- [ ] 有测试验证

### 3. 文件边界核验
- [ ] 未修改共享文件
- [ ] 未修改 Phase 0-3 已交付文件
- [ ] 新建文件在合理目录内

### 4. 测试核验
- [ ] grants 权限矩阵测试
- [ ] invite token 生命周期测试
- [ ] 所有权转移测试
- [ ] 评论/审阅/活动/通知测试
- [ ] 现有测试不回归

### 5. Gate 3 核验

**Gate 3：资源权利**
- [ ] Universe/Project/Actor/Asset 创建后即可邀请、分享、使用或授权
- [ ] grant/RLS 权限矩阵通过
- [ ] 撤销保留历史事实
- [ ] 无 P0/P1 权限漏洞

### 6. 综合判定

- [ ] 资源权利完整（RG-001~006）
- [ ] 项目协作完整（CO-001~008）
- [ ] **Phase 4 验证 PASS / FAIL**
- [ ] **Gate 3 PASS / FAIL**
