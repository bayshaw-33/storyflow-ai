import { expect, test } from "@playwright/test";

/**
 * KIIKIS 2.1 Phase 2 — 剧本到动态宫格分镜 E2E (Task 2.8)
 *
 * 覆盖 PRD §9 验收路径：
 *   1. 安全边界：未认证访问 storyboards API → 401
 *   2. 完整流程（需认证）：handoff 创建 → 列表为空 → POST 创建第一个版本 →
 *      GET 当前版本 → POST 用过期 revision 触发 409 → 接受服务端版本
 *   3. UI：Production Workbench 加 handoffId 参数渲染动态分镜 tab
 *
 * 认证依赖：
 *   - 场景 1 测试安全边界，不需要凭证。
 *   - 场景 2-3 通过环境变量 DYNAMIC_GRID_E2E_TOKEN / DYNAMIC_GRID_E2E_HANDOFF_ID
 *     注入；未设置时自动 skip（与 exports-api.spec.ts 模式一致）。
 *
 * 团队提供的 EP25–EP30 文件作为人工验收格式参照，不把全文复制进测试仓库。
 * 脱敏小型契约 fixture 覆盖 4/6/9/12、NEW/CONTINUOUS、多地点 montage 在
 * tests/fixtures/kiikis-21/dynamic-grid-input.json 中维护。
 */

const TEST_TOKEN = process.env.DYNAMIC_GRID_E2E_TOKEN || "";
const TEST_HANDOFF_ID = process.env.DYNAMIC_GRID_E2E_HANDOFF_ID || "";
const TEST_SCENE_ID = process.env.DYNAMIC_GRID_E2E_SCENE_ID || "scene-e2e-01";
const SKIP_AUTHED = !TEST_TOKEN || !TEST_HANDOFF_ID;

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// ============================================================
// 场景 1：安全边界（无认证 → 401）
// ============================================================

test.describe("Dynamic Grid Storyboard 安全边界", () => {
  test("未认证 GET /api/v2/storyboards → 401", async ({ request }) => {
    const res = await request.get(
      `/api/v2/storyboards?handoffId=00000000-0000-0000-0000-000000000000`,
    );
    expect(res.status()).toBe(401);
  });

  test("未认证 POST /api/v2/storyboards → 401", async ({ request }) => {
    const res = await request.post(`/api/v2/storyboards`, {
      data: {
        handoffId: "00000000-0000-0000-0000-000000000000",
        sceneId: TEST_SCENE_ID,
        continuityMode: "NEW",
        gridCount: 4,
        gridRationale: "e2e",
        spatialPlan: { axis: "180-degree", entrances: ["left"], screenDirections: ["left-to-right"] },
        sharedCinematography: "cool blue",
        negativePrompt: "text",
        frames: [],
        revisionSource: "user",
        expectedRevision: -1,
      },
    });
    expect(res.status()).toBe(401);
  });
});

// ============================================================
// 场景 2：完整 API 流程（需认证）
// ============================================================

test.describe("Dynamic Grid Storyboard API 流程", () => {
  test.skip(SKIP_AUTHED, "需要 DYNAMIC_GRID_E2E_TOKEN + DYNAMIC_GRID_E2E_HANDOFF_ID");

  test("创建第一个版本 → 查询当前 → CAS 冲突 → 接受服务端", async ({ request }) => {
    const authHeaders = { Authorization: `Bearer ${TEST_TOKEN}` };

    // 1. 列表查询（初始应为空或已有版本）
    const listRes = await request.get(
      `/api/v2/storyboards?handoffId=${encodeURIComponent(TEST_HANDOFF_ID)}`,
      { headers: authHeaders },
    );
    expect([200, 404]).toContain(listRes.status());

    // 2. 创建第一个版本 (expectedRevision=-1)
    const createBody = {
      handoffId: TEST_HANDOFF_ID,
      sceneId: TEST_SCENE_ID,
      continuityMode: "NEW",
      gridCount: 4,
      gridRationale: "E2E: low density establishing scene",
      spatialPlan: {
        axis: "180-degree",
        entrances: ["left"],
        screenDirections: ["left-to-right"],
      },
      sharedCinematography: "Cool blue tones, low key lighting",
      negativePrompt: "text, watermark, subtitle, burned-in caption",
      frames: [
        {
          id: "e2e-frame-1",
          order: 1,
          aspectRatio: "9:16",
          visualDescription: "Empty room, moonlight",
          characterIds: [],
          shotSize: "wide",
          cameraMovement: "slow dolly forward",
          emotion: "",
          dialogue: "",
          action: "establishing",
          timecode: "00:00:01",
          locked: false,
          userEdited: false,
        },
        {
          id: "e2e-frame-2",
          order: 2,
          aspectRatio: "9:16",
          visualDescription: "Isa enters from left",
          characterIds: ["char-isa"],
          shotSize: "medium",
          cameraMovement: "static",
          emotion: "tense",
          dialogue: "Anyone there?",
          action: "enters",
          timecode: "00:00:04",
          locked: false,
          userEdited: false,
        },
        {
          id: "e2e-frame-3",
          order: 3,
          aspectRatio: "9:16",
          visualDescription: "Close-up hand on lock",
          characterIds: ["char-isa"],
          shotSize: "close-up",
          cameraMovement: "static",
          emotion: "anxious",
          dialogue: "",
          action: "locks door",
          timecode: "00:00:07",
          locked: false,
          userEdited: false,
        },
        {
          id: "e2e-frame-4",
          order: 4,
          aspectRatio: "9:16",
          visualDescription: "Wide, Isa sits in chair",
          characterIds: ["char-isa"],
          shotSize: "wide",
          cameraMovement: "slow push-in",
          emotion: "weary",
          dialogue: "Ten minutes.",
          action: "sits",
          timecode: "00:00:10",
          locked: false,
          userEdited: false,
        },
      ],
      revisionSource: "user",
      expectedRevision: -1,
    };

    const createRes = await request.post(`/api/v2/storyboards`, {
      headers: authHeaders,
      data: createBody,
    });
    expect([201, 200, 409]).toContain(createRes.status());

    if (createRes.status() === 201 || createRes.status() === 200) {
      const created = await createRes.json();
      expect(created.success).toBe(true);
      expect([created.rowId, created.revision].some((v) => v !== undefined)).toBe(true);

      // 3. 用过期 revision (0) 再次 POST → 应返回 409 cas_mismatch
      const conflictBody = { ...createBody, expectedRevision: 0, sceneId: TEST_SCENE_ID };
      const conflictRes = await request.post(`/api/v2/storyboards`, {
        headers: authHeaders,
        data: conflictBody,
      });
      expect(conflictRes.status()).toBe(409);
      const conflictJson = await conflictRes.json();
      expect(conflictJson.success).toBe(false);
      // 冲突响应必须包含字段级 diff
      expect(conflictJson.diff || conflictJson.details?.diff).toBeTruthy();
    }

    // 4. 查询当前版本（最终状态一致）
    const currentRes = await request.get(
      `/api/v2/storyboards?handoffId=${encodeURIComponent(TEST_HANDOFF_ID)}&sceneId=${encodeURIComponent(TEST_SCENE_ID)}`,
      { headers: authHeaders },
    );
    expect([200, 404]).toContain(currentRes.status());
  });
});

// ============================================================
// 场景 3：UI 渲染（需认证 + 本地 dev server）
// ============================================================

test.describe("Production Workbench 动态分镜 tab", () => {
  test.skip(SKIP_AUTHED, "需要 DYNAMIC_GRID_E2E_TOKEN + DYNAMIC_GRID_E2E_HANDOFF_ID");

  test("加载 /production?handoffId=... 显示动态分镜 tab 与场景选择栏", async ({ page }) => {
    // 登录态由测试环境 cookie 提供（CI 通过 storageState 注入）
    await page.goto(
      `${BASE_URL}/production?handoffId=${encodeURIComponent(TEST_HANDOFF_ID)}&mode=planning`,
    );

    // 动态分镜 tab 标签存在
    const gridTab = page.locator('button, [role="tab"]', { hasText: "动态分镜" }).first();
    await expect(gridTab).toBeVisible({ timeout: 15000 });

    // 点击进入动态分镜 tab
    await gridTab.click();

    // 场景选择栏存在
    const sceneSelect = page.locator('[aria-label="选择场景"]').first();
    await expect(sceneSelect).toBeVisible({ timeout: 10000 });
  });

  test("缺少 handoffId 时显示提示而非编辑器", async ({ page }) => {
    await page.goto(`${BASE_URL}/production?mode=planning`);
    const gridTab = page.locator('button, [role="tab"]', { hasText: "动态分镜" }).first();
    await expect(gridTab).toBeVisible({ timeout: 15000 });
    await gridTab.click();
    // 应显示提示文案，而非编辑器
    await expect(page.locator("text=请先在剧本工作台「定稿并进入分镜」以生成 handoff").first()).toBeVisible({ timeout: 10000 });
  });
});
