import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E 配置
 * PRD §12 测试矩阵：Chrome / Safari / Edge
 * 屏幕：1440×900 / 1366×768 / MacBook 13/14
 * 优先保证 redirect E2E（Must Fix 4），主链 E2E 后续补充
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: { width: 1366, height: 768 } },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: process.env.CI
    ? {
        command: "pnpm build && pnpm start",
        port: 3000,
        timeout: 180_000,
        reuseExistingServer: false,
      }
    : {
        command: "pnpm dev",
        port: 3000,
        timeout: 120_000,
        reuseExistingServer: true,
      },
});
