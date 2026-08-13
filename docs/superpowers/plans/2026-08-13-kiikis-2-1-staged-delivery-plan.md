# Kiikis 2.1 Staged Delivery Implementation Plan

> **For TRAE and COZE:** Do not execute this release as one context. Use the phase folders linked below.

**Goal:** Deliver Kiikis 2.1 through eight bounded implementation/verification gates, preserving personal ownership, production continuity, and auditable facts.

**Architecture:** Existing Next.js 15 + Supabase/Postgres remains the platform. Structured immutable versions, server grants, append-only creative events, Stripe webhooks, entitlement ledger, and publication projections are the authoritative boundaries. UI clients consume these contracts and never infer ownership, payment or completion.

**Tech Stack:** Next.js 15, React 19, TypeScript 5.8, Supabase/Postgres/RLS/Realtime, Stripe REST/webhooks, Node test runner, Playwright.

---

## Delivery map

| Order | Implementation plan | Independent verification |
|---:|---|---|
| 0 | [`../../kiikis-2.1/TRAE/00-Phase-0-P0基线修复.md`](../../kiikis-2.1/TRAE/00-Phase-0-P0基线修复.md) | [`../../kiikis-2.1/COZE/00-Phase-0-P0基线验证.md`](../../kiikis-2.1/COZE/00-Phase-0-P0基线验证.md) |
| 1 | [`../../kiikis-2.1/TRAE/01-Phase-1-数据事件与迁移地基.md`](../../kiikis-2.1/TRAE/01-Phase-1-数据事件与迁移地基.md) | [`../../kiikis-2.1/COZE/01-Phase-1-数据事件与迁移验证.md`](../../kiikis-2.1/COZE/01-Phase-1-数据事件与迁移验证.md) |
| 2 | [`../../kiikis-2.1/TRAE/02-Phase-2-剧本到动态宫格分镜.md`](../../kiikis-2.1/TRAE/02-Phase-2-剧本到动态宫格分镜.md) | [`../../kiikis-2.1/COZE/02-Phase-2-剧本到动态宫格分镜验证.md`](../../kiikis-2.1/COZE/02-Phase-2-剧本到动态宫格分镜验证.md) |
| 3 | [`../../kiikis-2.1/TRAE/03-Phase-3-KK实时智能体与外观.md`](../../kiikis-2.1/TRAE/03-Phase-3-KK实时智能体与外观.md) | [`../../kiikis-2.1/COZE/03-Phase-3-KK实时智能体与外观验证.md`](../../kiikis-2.1/COZE/03-Phase-3-KK实时智能体与外观验证.md) |
| 4 | [`../../kiikis-2.1/TRAE/04-Phase-4-资源权利与轻协作.md`](../../kiikis-2.1/TRAE/04-Phase-4-资源权利与轻协作.md) | [`../../kiikis-2.1/COZE/04-Phase-4-资源权利与轻协作验证.md`](../../kiikis-2.1/COZE/04-Phase-4-资源权利与轻协作验证.md) |
| 5 | [`../../kiikis-2.1/TRAE/05-Phase-5-IP资产社区与治理.md`](../../kiikis-2.1/TRAE/05-Phase-5-IP资产社区与治理.md) | [`../../kiikis-2.1/COZE/05-Phase-5-IP资产社区与治理验证.md`](../../kiikis-2.1/COZE/05-Phase-5-IP资产社区与治理验证.md) |
| 6 | [`../../kiikis-2.1/TRAE/06-Phase-6-订阅与交易内测.md`](../../kiikis-2.1/TRAE/06-Phase-6-订阅与交易内测.md) | [`../../kiikis-2.1/COZE/06-Phase-6-订阅与交易内测验证.md`](../../kiikis-2.1/COZE/06-Phase-6-订阅与交易内测验证.md) |
| 7 | [`../../kiikis-2.1/TRAE/07-Phase-7-集成UAT与发布.md`](../../kiikis-2.1/TRAE/07-Phase-7-集成UAT与发布.md) | [`../../kiikis-2.1/COZE/07-Phase-7-集成UAT与发布验证.md`](../../kiikis-2.1/COZE/07-Phase-7-集成UAT与发布验证.md) |

## Execution discipline

1. Begin each phase from a clean, current `main`; record the base commit.
2. Read the total PRD, the current TRAE phase file, and only the previous handoff.
3. Follow red-green-refactor: add the stated failing test before production code.
4. Use forward-only migrations and record applied environments.
5. Run the phase-specific suite, `npx tsc --noEmit`, and `pnpm build` before handoff.
6. Commit the phase separately. Do not combine later-phase features.
7. COZE executes the matching black-box validation and returns PASS/CONDITIONAL PASS/FAIL.
8. Start the next phase only after PASS or an explicitly accepted CONDITIONAL PASS.
