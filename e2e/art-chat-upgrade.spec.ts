import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createArtAsset, createEmptyArtWorkbenchState, resolveArtDraftKey } from '../lib/art-workbench';
import { resolveStandaloneArtDraftKey } from '../lib/art/chat-workflow';

const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL || readFileSync('.env.local', 'utf8').match(/^NEXT_PUBLIC_SUPABASE_URL=["']?([^\s"']+)/m)![1]).hostname;
const user = { id: '00000000-0000-4000-8000-000000000003', aud: 'authenticated', role: 'authenticated', email: 'art-test@example.test', user_metadata: {} };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZV8AAAAASUVORK5CYII=', 'base64');
async function setup(page: Page) {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })}.test`;
  await page.addInitScript(({ token, user, authKey }) => {
    localStorage.setItem('kiiskiis_locale', 'zh-CN');
    localStorage.setItem(authKey, JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user }));
  }, { token, user, authKey: `sb-${host.split('.')[0]}-auth-token` });
  await page.route(`https://${host}/**`, route => route.fulfill({ json: route.request().url().includes('/auth/v1/user') ? user : [] }));
  await page.route('**/art-test.png', route => route.fulfill({ contentType: 'image/png', body: png }));
  const drafts = new Map<string, any>();
  const jobs = new Map<string, any>();
  const chats: any[] = [], generations: any[] = [];
  let fail = false;
  await page.route('**/api/**', async route => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    if (path === '/api/art/draft') {
      if (request.method() === 'PUT') { const body = request.postDataJSON(); drafts.set(body.draftId || body.workId, body.draft); await route.fulfill({ json: { success: true } }); }
      else await route.fulfill({ json: { success: true, draft: drafts.get(url.searchParams.get('draftId') || url.searchParams.get('workId') || '') || null } });
    } else if (path === '/api/art/models') await route.fulfill({ json: { models: [
      { id: 'flux-2-pro', label: 'FLUX 2 Pro', provider: 'flux', capabilities: ['text-to-image', 'image-edit'], maxReferences: 8, aspectRatios: ['9:16', '16:9', '1:1'], recommendedFor: ['concept'] },
      { id: 'text-only', label: '仅文生图模型', provider: 'atlas', capabilities: ['text-to-image'], maxReferences: 0, aspectRatios: ['9:16'], recommendedFor: ['concept'] },
    ] } });
    else if (path === '/api/art/upload-reference') await route.fulfill({ json: { success: true, previewUrl: '/art-test.png', storagePath: `${user.id}/references/ref.png` } });
    else if (path === '/api/art/chat') {
      chats.push(request.postDataJSON());
      await route.fulfill({ json: { success: true, assistantText: '正在按要求生成候选。', actions: [], generation: { prompt: '雨夜街头的角色，保持参考身份', kind: 'character', name: '雨夜角色' } } });
    } else if (path === '/api/art/generate-image') {
      const body = request.postDataJSON(); generations.push(body);
      const images = [{ previewUrl: '/art-test.png', storagePath: `${user.id}/test/generated/${body.jobId}.png`, provider: 'flux', model: 'flux-2-pro' }];
      jobs.set(body.jobId, { status: fail ? 'failed' : 'completed', images: fail ? [] : images, error: fail ? '测试生成失败' : undefined });
      await route.fulfill({ status: fail ? 502 : 200, json: { success: !fail, images: fail ? [] : images, error: fail ? '测试生成失败' : undefined } });
    } else if (path.startsWith('/api/art/jobs/')) await route.fulfill({ json: { success: true, job: jobs.get(path.split('/').pop()!) || null } });
    else if (path === '/api/art/download') await route.fulfill({ headers: { 'Content-Type': 'image/png', 'Content-Disposition': 'attachment; filename="art.png"' }, body: png });
    else if (path === '/api/art/sign-assets') {
      const urls = Object.fromEntries(request.postDataJSON().paths.map((p: string) => [p, '/art-test.png'])); await route.fulfill({ json: { success: true, urls } });
    } else await route.fulfill({ json: { success: true, messages: [], threads: [] } });
  });
  return { drafts, jobs, chats, generations, setFail: (value: boolean) => { fail = value; } };
}

test('new draft never imports old assets; first manual asset opens immediately', async ({ page }) => {
  await setup(page);
  const legacy = { ...createEmptyArtWorkbenchState(), assets: [createArtAsset('character', { name: '旧项目角色' })] };
  await page.addInitScript(value => localStorage.setItem('kiikis_art_workbench_state', JSON.stringify(value)), legacy);
  await page.goto('/art-workbench?setup=1');
  await expect(page.getByRole('button', { name: '手动新增', exact: true })).toBeEnabled();
  await expect(page.getByText('旧项目角色', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '手动新增', exact: true }).click();
  const card = page.getByRole('link').filter({ hasText: '新角色' });
  const href = await card.getAttribute('href');
  expect(href).toContain('draftId=');
  await card.click();
  await expect(page.getByRole('heading', { name: '新角色', exact: true })).toBeVisible();
  await expect(page.getByText('没有找到这个美术资产。', { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: '新角色', exact: true })).toBeVisible();
  await page.goto('/art-workbench?setup=1');
  await expect(page.getByRole('button', { name: '手动新增', exact: true })).toBeEnabled();
  await expect(page.getByRole('link').filter({ hasText: '新角色' })).toHaveCount(0);
  const oldDraftId = new URL(href!, 'https://kiikis.test').searchParams.get('draftId')!;
  await page.evaluate(id => window.history.pushState(null, '', `/art-workbench?draftId=${id}`), oldDraftId);
  await expect(page.getByRole('link').filter({ hasText: '新角色' })).toBeVisible();
  await page.evaluate(() => window.history.pushState(null, '', '/art-workbench?draftId=fresh-client-navigation'));
  await expect(page.getByRole('button', { name: '手动新增', exact: true })).toBeEnabled();
  await expect(page.getByRole('link').filter({ hasText: '新角色' })).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('kiikis_art_workbench_state')!).assets[0].name)).toBe('旧项目角色');
});

test('chat references reach generation; model menu, collapse, download, failure and cloud recovery', async ({ page }) => {
  const app = await setup(page);
  await page.goto('/art-workbench?draftId=art-chat-test');
  const composer = page.getByRole('textbox', { name: '美术创作要求' });
  await expect(composer).toBeEnabled();
  await page.locator('summary[aria-label="选择生图模型"]').click();
  await expect(page.getByRole('button', { name: /仅文生图模型/ })).toBeVisible();
  await page.getByRole('button', { name: /FLUX 2 Pro/ }).click();
  await page.locator('input[type=file][accept="image/png,image/jpeg,image/webp"]').setInputFiles({ name: 'reference.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: '移除参考图 reference.png' })).toBeVisible();
  await page.locator('summary[aria-label="选择生图模型"]').click();
  await expect(page.getByRole('button', { name: /仅文生图模型/ })).toHaveCount(0);
  await page.getByRole('button', { name: /FLUX 2 Pro/ }).click();
  await composer.fill('参考图片生成雨夜全身照');
  await page.getByRole('button', { name: '发送美术要求' }).click();
  await expect(composer).toHaveValue('');
  expect(app.generations[0].referencePaths).toEqual([`${user.id}/references/ref.png`]);
  expect(app.generations[0].aspectRatio).toBe('9:16');
  expect(app.generations[0].modelId).toBe('flux-2-pro');
  await expect(page.getByRole('link', { name: '编辑资产', exact: true })).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '下载原图 1', exact: true }).last().click();
  expect((await download).suggestedFilename()).toBe('Kiikis-art.png');
  await page.getByRole('button', { name: '收起美术仓库' }).click();
  await expect(page.locator('#art-repository')).toBeHidden();
  expect((await composer.boundingBox())!.width).toBeGreaterThan(1000);
  expect((await composer.boundingBox())!.y + (await composer.boundingBox())!.height).toBeLessThan(900);
  await expect(page.getByRole('button', { name: '展开美术仓库' })).toBeInViewport();
  await page.getByRole('button', { name: '展开美术仓库' }).click();
  await page.screenshot({ path: 'test-results/art-chat-expanded.png', fullPage: false });
  await page.getByRole('button', { name: '收起美术仓库' }).click();
  await page.getByRole('button', { name: '将图片 1 作为参考', exact: true }).last().click();
  app.setFail(true);
  await composer.fill('换成晴天，保持脸部');
  await page.getByRole('button', { name: '发送美术要求' }).click();
  await expect(page.locator('button[role=alert]')).toContainText('测试生成失败');
  await expect(composer).toHaveValue('换成晴天，保持脸部');
  await expect(page.getByRole('button', { name: '移除参考图 参考图 1' })).toBeVisible();
  expect(app.chats[1].history.some((entry: any) => entry.content.includes('雨夜全身照'))).toBe(true);
  await page.screenshot({ path: 'test-results/art-chat-desktop.png', fullPage: false });
  await expect.poll(() => app.drafts.get('art-chat-test')?.state.assets.length).toBeGreaterThan(0);
  await page.evaluate(() => { for (const key of Object.keys(localStorage)) if (key.startsWith('kiikis_art_workbench_state:')) localStorage.removeItem(key); });
  await page.reload();
  await expect(page.getByRole('link', { name: '编辑资产', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: '收起美术仓库' }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/art-chat-mobile.png', fullPage: false });
});

test('cold embedded detail waits for scoped cloud draft and preserves Work on return', async ({ page }) => {
  const app = await setup(page);
  const asset = createArtAsset('character', { name: '当前项目角色' });
  const draft = { state: { ...createEmptyArtWorkbenchState(), assets: [asset] }, messages: [], jobs: [] };
  app.drafts.set('work-new', draft);
  await page.route('**/api/art/draft?**', async route => { await new Promise(resolve => setTimeout(resolve, 800)); await route.fulfill({ json: { success: true, draft } }); });
  await page.goto(`/art-workbench/assets/${asset.id}?projectId=project-new&sourceUnitId=unit-new&workId=work-new`);
  await expect(page.getByText('正在载入当前美术资产…')).toBeVisible();
  await expect(page.getByRole('heading', { name: '当前项目角色' })).toBeVisible();
  await expect(page.getByRole('link', { name: /返回/ }).first()).toHaveAttribute('href', /workId=work-new/);
  const key = resolveArtDraftKey({ userId: user.id, projectId: 'project-new', workId: 'work-new' })!;
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)!).assets[0].name, key)).toBe('当前项目角色');
});

test('detail uses its current local asset when cloud read is unavailable', async ({ page }) => {
  await setup(page);
  const asset = createArtAsset('character', { name: '本机当前角色' });
  const key = resolveStandaloneArtDraftKey(user.id, 'local-fallback')!;
  await page.addInitScript(({ key, state }) => localStorage.setItem(key, JSON.stringify(state)), { key, state: { ...createEmptyArtWorkbenchState(), assets: [asset] } });
  await page.route('**/api/art/draft?**', route => route.fulfill({ status: 502, json: { error: 'storage unavailable' } }));
  await page.goto(`/art-workbench/assets/${asset.id}?draftId=local-fallback`);
  await expect(page.getByRole('heading', { name: '本机当前角色' })).toBeVisible();
  await expect(page.getByText('当前项目中没有这个美术资产。')).toHaveCount(0);
});

test('refresh recovers completed image job without submitting a second paid generation', async ({ page }) => {
  const app = await setup(page);
  const asset = createArtAsset('character', { name: '恢复角色' });
  const job = { id: 'recover-job', assetId: asset.id, variantId: asset.variants![0].id, prompt: '雨夜', status: 'running', createdAt: new Date().toISOString() };
  app.drafts.set('resume', { state: { ...createEmptyArtWorkbenchState(), assets: [asset] }, messages: [], jobs: [job] });
  app.jobs.set(job.id, { ...job, status: 'completed', images: [{ previewUrl: '/art-test.png', storagePath: `${user.id}/resume/generated/recovered.png` }] });
  await page.goto('/art-workbench?draftId=resume');
  await expect(page.getByRole('link', { name: '编辑资产' })).toBeVisible();
  expect(app.generations.length).toBe(0);
  const key = resolveStandaloneArtDraftKey(user.id, 'resume')!;
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '{}').assets?.[0].variants[0].versions.length, key)).toBe(1);
});
