# KIIKIS 2.1 Phase 7：COZE 验证计划

> 验证者：COZE（布朗）
> PRD 来源：§14 + §15 + §16
> TRAE 任务文件：`kiikis-2.1/TRAE/phase-7.md`

## 验证范围

Phase 7 交付物：Gate 0-5 全部复验 + 移除 Community 公开限制 + §16 版本完成定义确认。
**最终判定**：Gate 0-5 全部 PASS → Kiikis 2.1 全面上线。

## 验证清单

### 1. 全量验证脚本

#### 1.1 Phase 0 verify-baseline.mjs
- [ ] 脚本存在且可运行
- [ ] 0 errors

#### 1.2 Phase 2 verify-screenplay.mjs
- [ ] 脚本存在且可运行
- [ ] 0 errors

#### 1.3 Phase 3 verify-kk-runtime.mjs
- [ ] 脚本存在且可运行
- [ ] 0 errors

#### 1.4 Phase 4 verify-grants.mjs
- [ ] 脚本存在且可运行
- [ ] 0 errors

#### 1.5 Phase 5 verify-community.mjs
- [ ] 脚本存在且可运行
- [ ] 0 errors

#### 1.6 Phase 6 verify-subscription.mjs
- [ ] 脚本存在且可运行
- [ ] 0 errors

#### 1.7 Phase 7 verify-gate-all.mjs（新建）
- [ ] 脚本存在且可运行
- [ ] 0 errors

### 2. 全量单元测试
- [ ] Phase 1 foundation 测试通过
- [ ] Phase 2 screenplay + storyboard 测试通过
- [ ] Phase 3 kk-runtime 测试通过
- [ ] Phase 4 grants + collaboration 测试通过
- [ ] Phase 5 community 测试通过
- [ ] Phase 6 billing + transactions 测试通过
- [ ] **总测试数和通过数记录**

### 3. Community 公开限制移除 (CM-010 解除)

#### 3.1 路由公开
- [ ] /community 不再受 communityBeta flag 限制
- [ ] 未登录用户可访问 /community 发现页
- [ ] 匿名用户可浏览 public publication

#### 3.2 API 公开
- [ ] community discover API 匿名可调用
- [ ] 匿名用户仍受 RLS 限制（只看 public，不能互动）
- [ ] 互动操作（关注/评论/反应）仍需登录

#### 3.3 安全不降级
- [ ] 移除 flag 后权限矩阵仍有效
- [ ] 匿名/普通/被屏蔽/审核员 4 角色权限不变
- [ ] 举报/审核/申诉流程不受影响

### 4. Gate 0-5 复验

#### Gate 0：产品基线
- [ ] 工作台无压缩/遮挡/横向溢出
- [ ] 项目卡、Dashboard 任务、任务中心详情进入正确目标
- [ ] 无点击无响应或 fixture 404

#### Gate 1：内部团队黄金路径
- [ ] 剧本到分镜链路完整（ScreenplayHandoffV1 → 动态宫格分镜）
- [ ] 导出可直接使用（Markdown/JSON/CSV/生产包）
- [ ] 无 P0/P1 数据丢失或覆盖

#### Gate 2：KK 真实实时
- [ ] staging/prod fixture 关闭
- [ ] 任务、进度、错误和结果来自服务器
- [ ] 跨页面、刷新、断线恢复满足时延指标（p95 ≤ 3s，重连 ≤ 10s）

#### Gate 3：资源权利
- [ ] Universe/Project/Actor/Asset 创建后即可邀请/分享/使用/授权
- [ ] grant/RLS 权限矩阵通过
- [ ] 撤销保留历史事实

#### Gate 4：社区安全运营
- [ ] 发现、关注、互动、通知和授权入口跑通
- [ ] 举报、屏蔽、审核、申诉、恢复跑通
- [ ] 无未解决 P0/P1 安全、隐私或审核缺陷

#### Gate 5：订阅与观测
- [ ] Stripe test 完整生命周期通过
- [ ] 权益只由 webhook 同步状态授予
- [ ] 核心事件、成本和漏斗可观测

### 5. §16 版本完成定义

- [ ] 真实创作生产连续且可恢复
- [ ] KK 是全站实时 AI 入口和持续陪伴
- [ ] 资源出生即具备权利和协作能力
- [ ] 社区围绕真实 IP 对象并可安全运营
- [ ] 订阅真实、交易内测诚实
- [ ] 所有关系能成为未来 3D 世界、AI 角色生活和 KK 经济的同一事实基础

### 6. 文件边界核验
- [ ] Phase 7 新建文件在 scripts/ 和 e2e/ 内
- [ ] 仅修改 feature-flags.ts 和/或 app/community/page.tsx（CM-010 解除）
- [ ] 其他 Phase 0-6 文件未被修改（或仅有 bug 修复，不改语义）

### 7. 最终 E2E
- [ ] gate-validation.spec.ts 存在
- [ ] 覆盖 Gate 0-5 冒烟路径
- [ ] /community 公开可访问

### 8. 线上验证
- [ ] kiikis.com 返回 200
- [ ] kiikis.com/kk 返回 200
- [ ] kiikis.com/community 可访问（解除限制后）

### 9. 综合判定

- [ ] Gate 0 PASS
- [ ] Gate 1 PASS
- [ ] Gate 2 PASS
- [ ] Gate 3 PASS
- [ ] Gate 4 PASS
- [ ] Gate 5 PASS
- [ ] §16 版本完成定义满足
- [ ] **Phase 7 验证 PASS / FAIL**
- [ ] **Kiikis 2.1 全面上线 PASS / FAIL**
