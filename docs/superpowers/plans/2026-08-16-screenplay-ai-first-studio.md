# KIIKIS V2.2 AI-first screenplay studio

## Objective

将 V2.2 剧本创作台收敛为两栏、AI 对话优先的工作流：世界观、角色圣经、剧情及大纲是可回退修改的三部曲门槛；雷同审查嵌入剧情及大纲；本土化保留在正文之后；剧本翻译入口移除；正式交付继续沿用样稿格式。

## Scope

- 更新 screenplay studio 客户端契约、导航、编辑区和 KK 对话区。
- 在单元创建服务端落实下游创建门槛，避免只依赖前端。
- 增加三部曲确认、雷同审查、本土化和样稿交付的可见状态。
- 保留不可变版本、冲突保护、stale 关系和候选修改审阅机制。
- 不触碰歌曲工作流的翻译能力，不修改无关工作区改动。

## Verification

- Node contract/UI tests for stage order, similarity placement, no screenplay translation stage, two-column layout, and gating.
- Existing screenplay service, candidate diff, formatter, and assembly tests.
- `npx tsc --noEmit`, `pnpm build`, and Playwright Chromium smoke checks at desktop and narrow widths.
- Deploy the verified commit to Vercel and record the deployment URL.

## Implementation order

1. Make the new stage and gate tests fail against the current three-column/free-entry implementation.
2. Update client contracts and server unit creation checks.
3. Replace the three-column shell with a two-column navigator + large AI conversation shell; move editor/support tools into contextual drawers.
4. Add explicit similarity review under outline and usable-checkpoint actions without deleting downstream versions.
5. Verify the existing screenplay formatter remains the formal sample-format path and keep song translation untouched.
6. Run the full checks, commit only task files, deploy to Vercel, and smoke-test the deployed build.
