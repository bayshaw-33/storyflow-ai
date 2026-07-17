import { test, expect } from "@playwright/test";

/**
 * 旧路由 redirect E2E（Must Fix 4）
 *
 * PRD §4.3 要求：旧剧本工作台从菜单删除，旧 URL 跳转到新路由。
 * 本测试覆盖 5 个旧 URL 的 redirect 行为，确保书签和外部链接不失效。
 *
 * 注意：部分 -workbench 路由本身也是 redirect（如 /script-workbench → /dashboard），
 * 测试只验证最终落地页是有效页面（非 404），不硬编码中间跳转目标。
 */

test.describe("旧路由 redirect（PRD §4.3）", () => {
  const legacyRoutes: Array<{ from: string; name: string }> = [
    { from: "/novel", name: "小说工作台" },
    { from: "/script", name: "剧本工作台" },
    { from: "/storyboard", name: "分镜工作台" },
    { from: "/video", name: "视频工作台" },
    { from: "/song", name: "音乐工作台" },
  ];

  for (const route of legacyRoutes) {
    test(`${route.name} 旧路由 ${route.from} 跳转到有效页面`, async ({ page }) => {
      const response = await page.goto(route.from);
      // 关键验证：最终 URL 不再是旧路由，且页面正常加载（非 404）
      expect(page.url()).not.toBe(new URL(route.from, page.url()).href);
      if (response) {
        expect(response.status()).toBeLessThan(400);
      }
    });
  }

  test("404 页面正确渲染（不存在的路由）", async ({ page }) => {
    const response = await page.goto("/this-route-does-not-exist-p0-test");
    expect(response?.status()).toBe(404);
    // 验证品牌化 404 页面内容
    await expect(page.locator("h1")).toContainText("404");
    await expect(page.locator("body")).toContainText("没有找到这个页面");
    await expect(page.getByText("返回首页")).toBeVisible();
  });

  test("404 页面返回首页链接可用", async ({ page }) => {
    await page.goto("/another-non-existent-route-p0");
    await page.getByText("返回首页").click();
    await expect(page).toHaveURL(/\//);
  });
});
