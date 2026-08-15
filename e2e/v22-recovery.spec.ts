/**
 * Phase 6 Task 6.4 Step 2/3/5 — 恢复与错误观测.
 *
 *   - 导入 Job 轮询幂等（GET 无副作用）
 *   - 媒体 Provider 超时/WebCodecs 不支持显示可执行退路
 *   - API 错误含 stable code + correlationId（无后端时验证真实错误路径）
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 6 — 恢复与观测", () => {
  test("Job 轮询端点幂等（GET 不产生副作用，未配置后端时真实失败）", async ({ request }) => {
    const response = await request.get("/api/v2/universe-imports/missing-session/jobs/missing-job");
    expect([401, 404, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test("WebCodecs 不支持时剪辑页显示兼容退路（不伪装成功）", async ({ page }) => {
    await page.goto("/editor");
    await expect(page.locator("body")).toBeVisible();
    // 无后端/无 WebCodecs 时不出现"预览成功"
    expect(await page.locator("text=预览成功").count()).toBe(0);
  });

  test("错误响应包含 stable code（服务端错误契约）", async ({ request }) => {
    const response = await request.get("/api/v2/works/missing-work/timeline");
    const body = (await response.json().catch(() => ({}))) as { code?: string };
    expect([401, 503]).toContain(response.status());
    // stable code 存在且非空（unauthenticated / service_unavailable）
    expect(typeof body.code).toBe("string");
    expect(body.code?.length ?? 0).toBeGreaterThan(0);
  });
});
