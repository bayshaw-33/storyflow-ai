# Kiikis 2.1 分阶段交付中心

> 文档版本：v1.0
> 日期：2026-08-13
> 产品路线：真实创作黄金路径牵引
> 执行 Agent：TRAE
> 独立验证 Agent：COZE

## 1. 使用入口

本文件夹是 Kiikis 2.1 的唯一交付入口。不要把整个版本作为一个超大任务交给 Agent。

- 产品负责人先阅读 [`KIIKIS-2.1-总PRD-v1.0.md`](./KIIKIS-2.1-总PRD-v1.0.md)。
- TRAE 每次只读取 [`TRAE/README.md`](./TRAE/README.md)、当前阶段文件和上一阶段交接记录。
- COZE 每次只读取 [`COZE/README.md`](./COZE/README.md)、当前阶段验证文件和 TRAE 当前阶段证据。
- 当前阶段未通过 COZE 门禁，TRAE 不得开始下一阶段。
- 不允许 Agent 仅凭聊天记忆宣称完成；代码、测试、截图、数据库证据和部署记录才是交付事实。

## 2. 文件结构

```text
docs/kiikis-2.1/
├── README.md
├── KIIKIS-2.1-总PRD-v1.0.md
├── TRAE/
│   ├── README.md
│   ├── 00-Phase-0-P0基线修复.md
│   ├── 01-Phase-1-数据事件与迁移地基.md
│   ├── 02-Phase-2-剧本到动态宫格分镜.md
│   ├── 03-Phase-3-KK实时智能体与外观.md
│   ├── 04-Phase-4-资源权利与轻协作.md
│   ├── 05-Phase-5-IP资产社区与治理.md
│   ├── 06-Phase-6-订阅与交易内测.md
│   └── 07-Phase-7-集成UAT与发布.md
└── COZE/
    ├── README.md
    ├── 00-Phase-0-P0基线验证.md
    ├── 01-Phase-1-数据事件与迁移验证.md
    ├── 02-Phase-2-剧本到动态宫格分镜验证.md
    ├── 03-Phase-3-KK实时智能体与外观验证.md
    ├── 04-Phase-4-资源权利与轻协作验证.md
    ├── 05-Phase-5-IP资产社区与治理验证.md
    ├── 06-Phase-6-订阅与交易内测验证.md
    └── 07-Phase-7-集成UAT与发布验证.md
```

## 3. 阶段依赖

| 阶段 | 名称 | 前置条件 | 结束条件 |
|---|---|---|---|
| Phase 0 | P0 基线修复 | 当前 `main` | 工作台布局与两处任务跳转通过 |
| Phase 1 | 数据、事件与迁移地基 | Phase 0 PASS | 事件、权限、feature flag、迁移基线通过 |
| Phase 2 | 剧本到动态宫格分镜 | Phase 1 PASS | 六集真实黄金路径可交付 |
| Phase 3 | KK 实时智能体与外观 | Phase 1 PASS | 全站真实任务、陪伴、账号库存通过 |
| Phase 4 | 资源权利与轻协作 | Phase 1 PASS | 资源出生即可邀请、分享、使用、授权 |
| Phase 5 | IP 资产社区与治理 | Phase 3、4 PASS | 邀请社区和完整治理闭环通过 |
| Phase 6 | 订阅与交易内测 | Phase 1、4 PASS | Stripe 生命周期与诚实交易内测通过 |
| Phase 7 | 集成 UAT 与发布 | Phase 2–6 PASS | Gate 0–5 共六个上线门禁全部通过 |

Phase 2、3、4 在 Phase 1 后可以由不同分支并行开发，但同一工作区不得并发改动同一文件；合并与数据库迁移仍按阶段编号顺序执行。

## 4. 通用交接格式

每个 TRAE 阶段完成时，在 PR 或任务结论中输出：

```md
## Phase X 交接
- 基线 commit：
- 结束 commit：
- 变更文件：
- 新增迁移：
- 新增/修改 API：
- 测试命令与原始结果：
- 手工验证 URL：
- 截图/录像：
- 已知限制：
- 回滚方式：
- 供 COZE 使用的测试账号/fixture：
```

COZE 完成验证后只能给出以下结论之一：

- `PASS`：所有 P0/P1 验收项通过，可以进入下一阶段。
- `CONDITIONAL PASS`：仅剩文案或不阻塞的 P2，列出风险与截止时间。
- `FAIL`：存在 P0/P1、证据缺失、fixture 冒充真实数据或无法复现。

## 5. 全局禁止事项

- 禁止把 fixture、演示订单、演示收益、假任务进度当作真实线上能力。
- 禁止用客户端参数授予权限、会员权益、所有权或支付成功状态。
- 禁止重写已进入历史的 Supabase migration；只能新增 forward-only migration。
- 禁止引入与 Universe、Actor、Project、Asset 现有稳定 ID 脱离的第二套世界模型。
- 禁止把 2.1 扩成企业组织、通用社交网络、付费抽卡、自动分账或 3D 大厅项目。
- 禁止删除或顺手提交与当前阶段无关的用户文件。
- 禁止跳过失败测试、删除验收断言或以“构建成功”替代真实用户旅程。

## 6. 规格来源

- 总 PRD：[`KIIKIS-2.1-总PRD-v1.0.md`](./KIIKIS-2.1-总PRD-v1.0.md)
- 批准后的架构设计：[`../superpowers/specs/2026-08-13-kiikis-2-1-aigc-metaverse-foundation-design.md`](../superpowers/specs/2026-08-13-kiikis-2-1-aigc-metaverse-foundation-design.md)
- 团队分镜格式：`契约之家_EP25-EP30_动态宫格分镜提示词_首格空镜重审版_v2.md`
