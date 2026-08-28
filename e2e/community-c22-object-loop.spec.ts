import { test, expect, type Browser } from "@playwright/test";

const publicationId = process.env.COMMUNITY_C2_PUBLICATION_ID;
const publicationTitle = process.env.COMMUNITY_C2_PUBLICATION_TITLE;
const storageStateA = process.env.COMMUNITY_C2_STORAGE_A;
const storageStateB = process.env.COMMUNITY_C2_STORAGE_B;
const missingRealContext = !publicationId || !publicationTitle || !storageStateA || !storageStateB;

test.describe("C2 real community object loop", () => {
  test.skip(missingRealContext, "需要 COMMUNITY_C2_PUBLICATION_ID/TITLE 和两个真实账号 storageState");

  test("账号 B 评论后，账号 A 在通知中心回到同一 publication", async ({ browser }: { browser: Browser }) => {
    const contextA = await browser.newContext({ storageState: storageStateA });
    const contextB = await browser.newContext({ storageState: storageStateB });
    const pageA = await contextA.newPage();
    const pageB = await contextB.newPage();

    try {
      await pageA.goto(`/community/${publicationId}`);
      await expect(pageA.getByRole("heading", { name: publicationTitle })).toBeVisible();

      await pageB.goto(`/community/${publicationId}`);
      await expect(pageB.getByRole("heading", { name: publicationTitle })).toBeVisible();
      const comment = `C2 real loop ${new Date().toISOString()}`;
      await pageB.getByRole("textbox", { name: "评论" }).fill(comment);
      await pageB.getByRole("button", { name: "发送评论" }).click();
      await expect(pageB.getByText(comment)).toBeVisible();

      await pageA.goto("/community");
      await pageA.getByRole("button", { name: "通知" }).click();
      await expect(pageA.getByRole("region", { name: "社区通知" })).toBeVisible();
      await expect(pageA.getByText(publicationTitle)).toBeVisible();
      await pageA.getByText(publicationTitle).click();
      await expect(pageA).toHaveURL(new RegExp(`/community/${publicationId}$`));
      await expect(pageA.getByRole("heading", { name: publicationTitle })).toBeVisible();
    } finally {
      await contextA.close();
      await contextB.close();
    }
  });
});
