# KIIKIS 2.1 Phase 6：COZE 验证计划

> 验证者：COZE（布朗）
> PRD 来源：§10 + §12.3 + §13 + §14 Gate 5
> TRAE 任务文件：`kiikis-2.1/TRAE/phase-6.md`

## 验证范围

Phase 6 交付物：Stripe 订阅全生命周期 / 权益同步 / 交易内测三种模式。
**Gate 5 判定**：Stripe test 完整生命周期通过，权益只由 webhook 同步状态授予，核心事件可观测。

## 验证清单

### 1. Stripe 订阅核心生命周期

#### 1.1 customer 映射 (BI-001)
- [ ] Stripe customer 与 Kiikis user 一一映射
- [ ] 映射存储在 subscriptions 表（user_id UNIQUE, stripe_customer_id UNIQUE）
- [ ] 重复调用不创建多个 customer
- [ ] 有测试验证

#### 1.2 Checkout 白名单 (BI-002)
- [ ] 维护允许的 price_id 白名单
- [ ] Checkout session 创建时校验 price_id
- [ ] 拒绝白名单外 price
- [ ] 有测试验证

#### 1.3 success URL 不授予权益 (BI-003)
- [ ] success_url 指向"确认中"页面
- [ ] 不直接授予权益
- [ ] 权益只由 webhook 确认后授予
- [ ] 有测试验证

#### 1.4 webhook 验签 (BI-004)
- [ ] 读取原始 raw body（非 parsed JSON）
- [ ] 使用 Stripe webhook secret 验证签名
- [ ] 验签失败返回 400
- [ ] secret 仅在服务器环境变量
- [ ] 有测试验证：篡改 body / 错误 secret 被拒绝

#### 1.5 webhook 幂等 (BI-005)
- [ ] subscription_events 表记录已处理 event_id
- [ ] 重复 event 返回 200 不重复处理
- [ ] 有测试验证

#### 1.6 拒绝旧事件覆盖 (BI-006)
- [ ] 记录 Stripe event 的 created timestamp
- [ ] 较旧事件不覆盖较新状态
- [ ] 有测试验证：乱序事件处理

#### 1.7 生命周期同步 (BI-007)
- [ ] 处理 checkout.session.completed
- [ ] 处理 customer.subscription.created/updated/deleted
- [ ] 处理 invoice.paid
- [ ] 处理 charge.refunded
- [ ] 订阅状态机正确（incomplete → active → past_due → canceled）
- [ ] 有测试验证

#### 1.8 权益服务器读取 (BI-008)
- [ ] 客户端不持有 entitlement 判定逻辑
- [ ] 权益查询通过 API 调用服务器
- [ ] 服务器读取 webhook 同步状态返回 plan tier
- [ ] 有测试验证：客户端无法伪造权益

### 2. Customer Portal 与观测

#### 2.1 Customer Portal (BI-009)
- [ ] 创建 Stripe Customer Portal session
- [ ] 用户可取消订阅、更新支付方式
- [ ] 如 Portal 不可用，提供等价 API 端点
- [ ] 有测试验证

#### 2.2 账单事件写入 (BI-010)
- [ ] 订阅状态变化写入 creative_events
- [ ] event_type 使用 billing.* 前缀
- [ ] payload 包含 plan_id、status、amount（不含 secret）
- [ ] 审计日志记录完整
- [ ] 有测试验证

### 3. 交易内测

#### 3.1 三种模式 (TX-001)
- [ ] 只开放 free、invite_only、manual_review
- [ ] 禁止其他模式
- [ ] 有测试验证

#### 3.2 批准创建 grant (TX-002)
- [ ] 批准后调用 Phase 4 grant 服务创建 grant
- [ ] grant 关联 transaction_id
- [ ] grant 有完整审计链
- [ ] 有测试验证

#### 3.3 条款快照 (TX-003)
- [ ] 保存 order、attribution、条款快照
- [ ] 条款快照不可变
- [ ] 有测试验证

#### 3.4 费用明示 (TX-004)
- [ ] 交易记录明示费用、争议处理、结算意图
- [ ] 有测试验证

#### 3.5 未移动资金 paid_amount=0 (TX-005)
- [ ] free 模式 paid_amount = 0
- [ ] invite_only 模式 paid_amount = 0
- [ ] manual_review 资金未移动前 paid_amount = 0
- [ ] 有测试验证

#### 3.6 UI 明示模式 (TX-006)
- [ ] 交易 UI 标注当前模式
- [ ] 不暗示自动到账、自动收益
- [ ] 有测试验证

#### 3.7 fixture 控制 (TX-007)
- [ ] staging/prod 默认关闭交易 fixture
- [ ] 演示数据永久标记 is_demo = true
- [ ] 有测试验证

#### 3.8 禁止自动收益 (TX-008)
- [ ] 无自动收益计算
- [ ] 无提现功能
- [ ] 无自动分账
- [ ] UI 无虚假余额或收益数字
- [ ] 有测试验证

### 4. 文件边界核验
- [ ] 未修改共享文件（或仅有 package.json 安装 stripe 包的合理例外）
- [ ] 未修改 Phase 0-5 已交付文件
- [ ] feature-flags.ts 未修改
- [ ] 新建文件在合理目录内

### 5. 安全核验 (§12.3)
- [ ] Stripe secret 仅在服务器
- [ ] plan entitlement 不信任客户端
- [ ] 支付写审计
- [ ] 无 secret 泄露到客户端 payload

### 6. 测试核验
- [ ] Stripe 订阅核心生命周期测试（BI-001~008）
- [ ] Customer Portal 与观测测试（BI-009~010）
- [ ] 交易内测测试（TX-001~008）
- [ ] 现有测试不回归

### 7. Gate 5 核验

**Gate 5：订阅与观测**
- [ ] Stripe test 完整生命周期通过
- [ ] 内部真实小额订阅完成付款、取消和退款验证
- [ ] 权益只由 webhook 同步状态授予
- [ ] 核心事件、成本和漏斗可观测

### 8. 综合判定

- [ ] Stripe 订阅核心完整（BI-001~008）
- [ ] Customer Portal 与观测完整（BI-009~010）
- [ ] 交易内测完整（TX-001~008）
- [ ] **Phase 6 验证 PASS / FAIL**
- [ ] **Gate 5 PASS / FAIL**
