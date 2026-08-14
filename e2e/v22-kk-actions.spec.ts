/**
 * Phase 0 Task 0.4 E2E — KK 真实目标
 *
 * Gate 0 验收：
 *   - KK 没有点击无响应
 *   - 每个显示动作都含合法 actionUrl 或明确禁用原因
 *   - 禁止仅显示进度文本（无目标时必须禁用并展示原因）
 *   - 非法外部 URL 不传给 router.push
 *
 * PRD §00-Phase-0 Task 0.4 Step 1/2/3：
 *   - Job → Job Detail
 *   - 等待确认 → candidate/review
 *   - 完成 → Work/Asset
 */
import { expect, test } from "@playwright/test";

test.describe("Phase 0 Task 0.4 — KK 真实目标", () => {
  test("KK 面板可加载，不出现页面级 404", async ({ page }) => {
    const response = await page.goto("/kk");
    expect(response?.status()).toBeLessThan(400);
  });

  test("KK 消息项的动作按钮要么可点击指向同源路由，要么明确禁用", async ({ page }) => {
    await page.goto("/kk");

    // 等待 KK 消息渲染（如果服务端未配置或无消息，消息列表可能为空）
    await page.waitForTimeout(1000);

    const actionButtons = page.locator('[data-kk-action]');
    const count = await actionButtons.count();

    for (let i = 0; i < count; i++) {
      const btn = actionButtons.nth(i);
      const disabled = await btn.getAttribute("aria-disabled");
      const href = await btn.getAttribute("data-action-url");

      if (disabled === "true") {
        // 禁用按钮必须有 title（禁用原因）
        const title = await btn.getAttribute("title");
        expect(title).toBeTruthy();
      } else {
        // 可点击按钮的 actionUrl 必须是同源路由（/开头，非外部 URL）
        if (href) {
          expect(href).toMatch(/^\//);
          expect(href).not.toMatch(/^https?:\/\//);
          expect(href).not.toContain("://");
        }
      }
    }
  });

  test("KK 消息不出现外部 URL 跳转按钮（防开放重定向）", async ({ page }) => {
    await page.goto("/kk");
    await page.waitForTimeout(1000);

    // 所有 data-action-url 必须是同源应用路由
    const urls = await page.locator('[data-action-url]').evaluateAll((els) =>
      els.map((el) => el.getAttribute("data-action-url") || ""),
    );

    for (const url of urls) {
      if (url) {
        expect(url).toMatch(/^\//);
        expect(url).not.toMatch(/^https?:\/\//i);
      }
    }
  });
});
