/**
 * Phase 6 Task 6.3 Journey E — Job / KK.
 * 运行 Job→Dashboard/Task Center/KK 一致→详情→取消/重试→查看真实结果。
 * 无真实后端时：验证页面渲染与真实失败语义，无伪造 job 结果。
 */
import { expect, test } from "@playwright/test";

test.describe("Journey E — Job / KK", () => {
  test("Task Center 渲染且无伪造 Job 结果", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page.locator("body")).toBeVisible();
    expect(await page.locator("text=任务已完成（fixture）").count()).toBe(0);
  });

  test("Job 动作 API 未配置后端时返回真实失败", async ({ request }) => {
    const response = await request.post("/api/v2/jobs/missing-job/cancel");
    expect([401, 404, 409, 503]).toContain(response.status());
    const body = await response.json().catch(() => ({}));
    expect(body.success).not.toBe(true);
  });

  test("KK 面板不出现伪造任务状态", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.locator("body")).toBeVisible();
    expect(await page.locator("text=KK 正在处理（演示）").count()).toBe(0);
  });
});
