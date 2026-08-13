# Phase 2：剧本到动态 4/6/9/12 宫格分镜

> 只执行本阶段。
> 需求：`K21-HO-001..004`、`K21-SB-001..009`
> 前置：Phase 1 COZE PASS
> 完成后交给：`COZE/02-Phase-2-剧本到动态宫格分镜验证.md`

## 1. 唯一目标

内部团队用真实六集剧本，从“剧本定稿”直接进入符合团队附件格式的动态宫格分镜，不复制粘贴、不重新解释松散 Markdown，并安全处理上游修改、人工锁定和确定性导出。

## 2. Task 2.1：版本化 handoff 契约

**Files:**

- Create: `lib/screenplay-handoff/contracts.ts`
- Create: `lib/screenplay-handoff/validate.ts`
- Create: `lib/screenplay-handoff/hash.ts`
- Create: `tests/screenplay-handoff-v1.test.mjs`

### Step 1：RED

覆盖完整合法样本、稳定 scene ID、9:16、NEW/CONTINUOUS、角色/场景母版版本、前后转场、Canon/source hash 和非法缺字段。

```ts
const parsed = parseScreenplayHandoffV1(sample);
assert.equal(parsed.schemaVersion, "kiikis.screenplay-handoff/1");
assert.equal(parsed.aspectRatio, "9:16");
assert.equal(await hashHandoffContent(sample), await hashHandoffContent(structuredClone(sample)));
```

### Step 2：GREEN

实现明确 TS 类型和无副作用 validator。禁止用自由 Markdown 作为下游事实源。

## 3. Task 2.2：不可变快照与 API

**Files:**

- Create: `supabase/migrations/20260827010000_kiikis_21_screenplay_handoffs.sql`
- Create: `lib/server/v2/screenplay-handoffs/index.ts`
- Create: `app/api/v2/projects/[projectId]/handoffs/route.ts`
- Create: `app/api/v2/projects/[projectId]/handoffs/[handoffId]/route.ts`
- Create: `tests/screenplay-handoff-api.test.mjs`

表至少保存：id、owner/project/universe/episode、schema version、source version/hash、Canon snapshot、content_json、created/confirmed、created_at。普通业务不允许 UPDATE handoff；上游改变创建新行。

先写测试覆盖 owner scope、重复 source hash 幂等、跨项目读取、更新拒绝，再实现。

## 4. Task 2.3：剧本工作台“定稿并进入分镜”

**Files:**

- Modify: `components/creation/CreationWorkbench.tsx`
- Create: `lib/screenplay-handoff/from-creation.ts`
- Create: `tests/creation-handoff-action.test.mjs`

流程：

```text
保存当前剧本版本
→ 校验项目/单集/场景稳定 ID
→ 解析并展示 handoff 摘要
→ 用户确认
→ 服务端创建不可变 handoff
→ 跳转 /production?projectId=&sourceUnitId=&handoffId=&mode=planning
```

缺母版、场景轴线或 continuityMode 时显示可修复问题，不生成半成品快照。

## 5. Task 2.4：动态分镜契约与导演规则

**Files:**

- Create: `lib/storyboard/dynamic-grid-contract.ts`
- Create: `lib/storyboard/dynamic-grid-rules.ts`
- Create: `tests/dynamic-grid-rules.test.mjs`

```ts
type DynamicGridCount = 4 | 6 | 9 | 12;
type DynamicGridSceneV1 = {
  schemaVersion: "kiikis.dynamic-grid-storyboard/1";
  handoffId: string;
  sceneId: string;
  continuityMode: "NEW" | "CONTINUOUS";
  gridCount: DynamicGridCount;
  gridRationale: string;
  spatialPlan: { axis: string; entrances: string[]; screenDirections: string[] };
  sharedCinematography: string;
  negativePrompt: string;
  frames: DynamicGridFrameV1[];
};
```

测试必须证明：

- NEW 首格无人物、有可执行 camera path；
- NEW 第 2 格后才能出现角色；
- CONTINUOUS 不被强制空镜；
- frames.length 等于 gridCount；
- 每格 aspect ratio 9:16；
- in-world text unreadable，dialogue/translation 不烧录；
- 相邻格景别或视点有变化，轴线和 screen direction 不矛盾。

## 6. Task 2.5：版本、锁定、diff 与 CAS

**Files:**

- Create: `supabase/migrations/20260827020000_kiikis_21_dynamic_storyboards.sql`
- Create: `lib/storyboard/dynamic-grid-store.ts`
- Create: `lib/storyboard/dynamic-grid-diff.ts`
- Create: `app/api/v2/storyboards/route.ts`
- Create: `app/api/v2/storyboards/[storyboardId]/route.ts`
- Create: `tests/dynamic-grid-store.test.mjs`

要求：版本 append-only；当前 revision 使用 CAS；frame 支持人工编辑/锁定；新 handoff 到达时按场生成 diff。锁定或人工编辑不得自动覆盖，冲突必须返回 409 与字段级差异。

## 7. Task 2.6：Production Workbench 接入

**Files:**

- Modify: `components/production/ProductionWorkbench.tsx`
- Modify: `lib/storyboard/client.ts`
- Create: `components/production/DynamicGridEditor.tsx`
- Create: `components/production/DynamicGridDiffDialog.tsx`
- Create: `tests/dynamic-grid-ui-contract.test.mjs`

UI 必须显示：场标题、NEW/CONTINUOUS、格数与理由、空间/轴线、共享摄影参数、每格图像/说明/锁定、上游差异和冲突选择。不要重做整个 Production Workbench。

## 8. Task 2.7：确定性导出

**Files:**

- Create: `lib/storyboard/render-team-markdown.ts`
- Create: `lib/storyboard/export-dynamic-grid.ts`
- Modify: `lib/storyboard/export-package.ts`
- Create: `tests/dynamic-grid-export.test.mjs`
- Create: `tests/fixtures/kiikis-21/expected-dynamic-grid.md`

同一输入必须字节级输出相同 Markdown。字段顺序固定：镜头编号、时间点、人物名、台词、情绪、动作、运镜说明。输出 JSON、CSV、Markdown 与生产包 manifest；dialogue translation 保留为后期字段。

```ts
const first = renderTeamMarkdown(storyboard);
const second = renderTeamMarkdown(structuredClone(storyboard));
assert.equal(first, second);
```

## 9. Task 2.8：真实六集 UAT fixture 与 E2E

**Files:**

- Create: `e2e/screenplay-to-dynamic-grid.spec.ts`
- Create: `scripts/verify-dynamic-grid-package.mjs`

使用团队提供的 EP25–EP30 文件作为人工验收格式参照，不把全文复制进测试仓库。准备脱敏、小型契约 fixture 覆盖 4/6/9/12、NEW/CONTINUOUS、多地点 montage。

## 10. 验证

```bash
node --test tests/screenplay-handoff-v1.test.mjs tests/screenplay-handoff-api.test.mjs tests/creation-handoff-action.test.mjs tests/dynamic-grid-*.test.mjs
npx playwright test e2e/screenplay-to-dynamic-grid.spec.ts --project=chromium
node scripts/verify-dynamic-grid-package.mjs <exported-package.zip>
npx tsc --noEmit
pnpm build
```

## 11. 交付证据

- 六集真实 UAT 的 handoff IDs、版本、场数和格数统计。
- 4/6/9/12、NEW/CONTINUOUS 截图。
- 人工锁定后上游修改的 409/diff 录像。
- 团队确认可直接使用的 Markdown/生产包。
- 所有测试、build、commit SHA。

## 12. 禁止扩展

- 不实现社区、KK 外观或支付。
- 不让 AI 通过改写 Markdown 生成数据库事实。
- 不为添加文字重复生图；文字由确定性排版生成。
