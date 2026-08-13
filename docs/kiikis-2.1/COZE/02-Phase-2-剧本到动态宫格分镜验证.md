# Phase 2 验证：剧本到动态宫格分镜

> 验证需求：`K21-HO-001..004`、`K21-SB-001..009`
> 输入：TRAE Phase 2 commit、六集 UAT 项目、导出包

## 1. 真实黄金路径

用内部团队真实六集批次操作：剧本定稿→确认 handoff→进入 Production→生成/编辑/锁定动态宫格→导出。全程禁止复制粘贴剧本文本到分镜。

记录 projectId、6 个 episode/sourceUnitId、handoffId/version/hash、storyboardId/revision、场数、4/6/9/12 格数量。

## 2. Handoff 不可变性

- 第一次定稿产生 `kiikis.screenplay-handoff/1`。
- 修改剧本后旧 handoff 内容/hash 不变，新建新版本。
- 跨账号、跨项目读取失败。
- 场景、Actor/Character/Location/Prop/Canon 版本稳定可追溯。

## 3. 导演规则抽样

每种格数至少抽 2 场，每种 continuity 至少抽 3 场：

- NEW 首格无人且有明确起幅、路径、速度/落幅；第 2 格后人物出现。
- CONTINUOUS 能承接动作、物件或视线，不机械插空镜。
- 每格 9:16；保护头手动作和关键道具。
- 轴线、screen direction、人物位置、服装、道具、光线、时间连续。
- 宫格图无烧录编号/台词/可读文字。
- dialogue/translation 存在于说明/导出，不进入图像。
- 多地点 montage 不制造虚假同场。

任何系统性违反 NEW 首格、格数或画幅是 P0/P1。

## 4. 编辑、锁定与冲突

1. 人工修改一格并锁定。
2. 修改上游该场剧本并创建新 handoff。
3. 验证显示字段级 diff。
4. 自动重分析不得覆盖锁定格。
5. 两浏览器同时保存，旧 revision 返回 409；用户可刷新或另存快照。

## 5. 导出一致性

- 相同 revision 导出两次，Markdown 字节/hash 一致。
- Markdown 字段顺序符合团队格式。
- JSON/CSV/manifest ID 与数据库一致。
- 生产包包含来源/版本/图片/提示词/说明，私有临时 URL 或 key 不得出现。
- 团队成员确认附件格式可无缝进入现有生产。

## 6. 自动化复跑

```bash
node --test tests/screenplay-handoff-v1.test.mjs tests/screenplay-handoff-api.test.mjs tests/creation-handoff-action.test.mjs tests/dynamic-grid-*.test.mjs
npx playwright test e2e/screenplay-to-dynamic-grid.spec.ts --project=chromium
node scripts/verify-dynamic-grid-package.mjs <exported-package.zip>
npx tsc --noEmit
pnpm build
```

## 7. PASS 门槛

真实六集无复制粘贴完成；4/6/9/12 与 NEW/CONTINUOUS 全覆盖；锁定、CAS、diff 无数据丢失；导出获团队确认。否则 FAIL。
