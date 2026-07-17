import { expect, test } from "@playwright/test";

/**
 * Export API E2E 测试（PRD §2.6 八场景）
 *
 * 任务卡：KIIKIS-TR-G0-002-9
 *
 * 覆盖三个新 API 端点 + 旧端点弃用：
 *   POST /api/exports/request
 *   GET  /api/exports/[id]/status
 *   GET  /api/exports/[id]/download
 *   POST /api/exports（旧端点）
 *
 * 认证依赖：
 *   - 场景 1-3 测试安全边界（无 auth → 401），不需要凭证。
 *   - 场景 4-8 需要有效 Supabase token 和 projectId。
 *     通过环境变量 EXPORT_E2E_TOKEN / EXPORT_E2E_PROJECT_ID 注入；
 *     未设置时自动 skip。
 */

const TEST_TOKEN = process.env.EXPORT_E2E_TOKEN || "";
const TEST_PROJECT_ID = process.env.EXPORT_E2E_PROJECT_ID || "";
const SKIP_AUTHED = !TEST_TOKEN || !TEST_PROJECT_ID;

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// --- 场景 1-3：安全边界（无认证 → 401）---

test.describe("Export API 安全边界", () => {
  test("场景1: POST /api/exports/request 无认证返回 401", async ({ request }) => {
    const res = await request.post("/api/exports/request", {
      data: {
        projectId: "test",
        exportType: "json",
        sourceKind: "project_json",
        jurisdictionProfile: "EU_ART50",
        aiOrigin: "ai_generated",
        providerCode: "KIIKIS",
        visibleDisclosureMode: "ui",
      },
    });
    expect(res.status()).toBe(401);
  });

  test("场景2: GET /api/exports/[id]/status 无认证返回 401", async ({ request }) => {
    const res = await request.get("/api/exports/00000000-0000-0000-0000-000000000000/status");
    expect(res.status()).toBe(401);
  });

  test("场景3: GET /api/exports/[id]/download 无认证返回 401", async ({ request }) => {
    const res = await request.get("/api/exports/00000000-0000-0000-0000-000000000000/download", {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(401);
  });
});

// --- 场景 4-8：功能验证（需要认证）---

test.describe("Export API 功能验证", () => {
  test.skip(SKIP_AUTHED, "需要 EXPORT_E2E_TOKEN 和 EXPORT_E2E_PROJECT_ID 环境变量");

  const authHeaders = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${TEST_TOKEN}`,
  };

  test("场景4: POST /api/exports/request 无效枚举返回 422", async ({ request }) => {
    const res = await request.post("/api/exports/request", {
      headers: authHeaders,
      data: {
        projectId: TEST_PROJECT_ID,
        exportType: "json",
        sourceKind: "project_json",
        jurisdictionProfile: "INVALID_PROFILE",
        aiOrigin: "ai_generated",
        providerCode: "KIIKIS",
        visibleDisclosureMode: "ui",
      },
    });
    expect(res.status()).toBe(422);
  });

  test("场景5: POST /api/exports/request 缺少 projectId 返回 400", async ({ request }) => {
    const res = await request.post("/api/exports/request", {
      headers: authHeaders,
      data: {
        exportType: "json",
        sourceKind: "project_json",
        jurisdictionProfile: "EU_ART50",
        aiOrigin: "ai_generated",
        providerCode: "KIIKIS",
        visibleDisclosureMode: "ui",
      },
    });
    expect(res.status()).toBe(400);
  });

  test("场景6: GET /api/exports/[id]/status 不存在的 ID 返回 404", async ({ request }) => {
    const res = await request.get("/api/exports/00000000-0000-0000-0000-000000000000/status", {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
    });
    expect(res.status()).toBe(404);
  });

  test("场景7: GET /api/exports/[id]/download 不存在的 ID 返回 404", async ({ request }) => {
    const res = await request.get("/api/exports/00000000-0000-0000-0000-000000000000/download", {
      headers: { Authorization: `Bearer ${TEST_TOKEN}` },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(404);
  });

  test("场景8: 旧端点 POST /api/exports 返回 Deprecation 头", async ({ request }) => {
    const res = await request.post("/api/exports", {
      headers: authHeaders,
      data: {
        projectId: TEST_PROJECT_ID,
        exportType: "json",
      },
    });
    // 旧端点仍可工作（200），但带弃用标记
    expect(res.status()).toBeLessThan(400);
    const deprecation = res.headers()["deprecation"];
    expect(deprecation).toBeTruthy();
    const body = await res.json();
    expect(body.deprecationWarning).toBeTruthy();
  });
});
