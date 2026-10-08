import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || readFileSync(".env.local", "utf8").match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)?.[1];
if (!supabaseUrl) throw new Error("Test requires NEXT_PUBLIC_SUPABASE_URL");
const host = new URL(supabaseUrl).hostname;
const projectId = "00000000-0000-4000-8000-000000000004";

test("pending revisions reach generation immediately; favorites survive reload; failures preserve drafts", async ({ page }) => {
  const user = { id: "00000000-0000-4000-8000-000000000003", aud: "authenticated", role: "authenticated", email: "song-test@example.test", user_metadata: {} };
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`;
  const project = { id: projectId, workflowType: "song", title: "城市夜景", genre: "Pop", targetLanguage: "English", finalScript: "[Verse]\nOld English draft", deliveryPackage: "## 歌词\n[Verse]\nOld English draft\n\n## Music Prompt\ncinematic piano", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  await page.addInitScript(({ storageKey, token, user, project }) => {
    localStorage.setItem("kiiskiis_locale", "zh-CN");
    if (!localStorage.getItem(storageKey)) localStorage.setItem(storageKey, JSON.stringify({ access_token: token, refresh_token: "test-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user }));
    if (!localStorage.getItem("storyflow-ai-projects-v1")) localStorage.setItem("storyflow-ai-projects-v1", JSON.stringify([project]));
  }, { storageKey: `sb-${host.split(".")[0]}-auth-token`, token, user, project });
  await page.route(`https://${host}/**`, (route) => route.fulfill({ json: route.request().url().includes("/auth/v1/user") ? user : [] }));
  let favorite = false;
  let failGeneration = false;
  let failFavorite = false;
  const generations: Record<string, any>[] = [];
  const batches: Record<string, any>[] = [];
  const favoriteWrites: boolean[] = [];
  const history = () => [{ id: "existing-song", jobId: "existing-song", label: "A", status: "completed", resultUrl: null, coverUrl: null, provider: "atlascloud", model: "suno/chirp-v6-mini", error: null, createdAt: new Date().toISOString(), favorite }];
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/ai/generate") {
      const body = request.postDataJSON();
      if (body.taskType === "song_workbench") {
        generations.push(body);
        await route.fulfill({ status: failGeneration ? 502 : 200, json: failGeneration ? { success: false, error: "测试生成失败" } : { success: true, output: `---LYRICS---\n[Verse]\n城市亮起灯火，第${generations.length}稿\n---MUSIC_PROMPT---\ncinematic piano, restrained chorus, version ${generations.length}` } });
      } else {
        expect(body.taskType).not.toBe("song_development_chat");
        await route.fulfill({ json: { success: true, output: "城市亮起灯火" } });
      }
    } else if (path === "/api/audio/jobs/batch") {
      batches.push(request.postDataJSON());
      await route.fulfill({ json: { jobs: ["A", "B"].map((label) => ({ label, job: { id: `new-${label}`, status: "completed", result_url: null, provider: "atlascloud", model: "suno/chirp-v6-mini" } })) } });
    } else if (path.endsWith("/favorite")) {
      expect(request.method()).toBe("PATCH");
      expect(new URL(request.url()).searchParams.get("projectId")).toBe(projectId);
      favoriteWrites.push(request.postDataJSON().favorite);
      if (!failFavorite) favorite = request.postDataJSON().favorite;
      await route.fulfill({ status: failFavorite ? 502 : 200, json: failFavorite ? { error: "测试收藏失败" } : { success: true, favorite } });
    } else if (path === "/api/audio/jobs") {
      expect(new URL(request.url()).searchParams.get("projectId")).toBe(projectId);
      await route.fulfill({ json: { jobs: history() } });
    } else {
      await route.fulfill({ json: { success: true, messages: [], threads: [] } });
    }
  });
  await page.goto(`/song-workbench?projectId=${projectId}`);
  const composer = page.locator(".song-chat-composer textarea");
  await expect(page.getByRole("button", { name: "收藏候选 A", exact: true })).toBeVisible();
  await composer.fill("请写中文歌词，副歌克制");
  await page.getByRole("button", { name: "生成内容文档", exact: true }).click();
  await expect(composer).toHaveValue("");
  expect(generations).toHaveLength(1);
  expect(JSON.parse(generations[0].input).outputLanguage).toBe("Chinese");
  expect(JSON.parse(generations[0].input).latestUserInstruction).toBe("请写中文歌词，副歌克制");
  expect(generations[0].context).toContain("请写中文歌词");
  await expect(page.getByRole("combobox", { name: "选择歌词文档", exact: true })).toContainText("歌词 · V2");
  await page.getByRole("combobox", { name: "选择人声方向", exact: true }).selectOption("female");
  await composer.fill("删掉第一段，副歌改成四句");
  await page.getByRole("button", { name: "生成音频候选", exact: true }).click();
  await expect(composer).toHaveValue("");
  await expect.poll(() => batches.length).toBe(1);
  expect(generations).toHaveLength(2);
  expect(JSON.parse(generations[1].input).latestUserInstruction).toBe("删掉第一段，副歌改成四句");
  expect(generations[1].context).toContain("城市亮起灯火，第1稿");
  expect(batches[0].candidates[0].lyrics).toContain("第2稿");
  expect(batches[0].candidates[0].prompt).toContain("version 2");
  expect(batches[0].inputParams.voiceGender).toBe("female");
  expect(batches[0].inputParams.language).toBe("Chinese");
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("storyflow-ai-projects-v1") || "[]"));
  expect(saved.find((entry: any) => entry.id === projectId).targetLanguage).toBe("Chinese");

  failGeneration = true;
  await composer.fill("失败时也要保留我的修改意见");
  const previousOptions = await page.getByRole("combobox", { name: "选择歌词文档", exact: true }).locator("option").count();
  await page.getByRole("button", { name: "生成内容文档", exact: true }).click();
  await expect(page.locator(".song-right-error[role='alert']")).toContainText("测试生成失败");
  await expect(composer).toHaveValue("失败时也要保留我的修改意见");
  expect(await page.getByRole("combobox", { name: "选择歌词文档", exact: true }).locator("option").count()).toBe(previousOptions);

  await page.locator('.song-audio-candidate').filter({ has: page.getByRole("button", { name: "收藏候选 A", exact: true }) }).last().getByRole("button", { name: "收藏候选 A", exact: true }).click();
  await expect.poll(() => favorite).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "取消收藏候选 A", exact: true })).toHaveAttribute("aria-pressed", "true");
  failFavorite = true;
  await page.getByRole("button", { name: "取消收藏候选 A", exact: true }).click();
  await expect(page.locator(".song-right-error[role='alert']")).toContainText("测试收藏失败");
  await expect(page.getByRole("button", { name: "取消收藏候选 A", exact: true })).toHaveAttribute("aria-pressed", "true");
  failFavorite = false;
  await page.getByRole("button", { name: "取消收藏候选 A", exact: true }).click();
  await expect(page.getByRole("button", { name: "收藏候选 A", exact: true })).toHaveAttribute("aria-pressed", "false");
  expect(favoriteWrites).toEqual([true, false, false]);
  await page.screenshot({ path: "test-results/music-workbench-revisions-desktop.png", fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/music-workbench-revisions-mobile.png", fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
