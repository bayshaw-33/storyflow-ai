import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { registerHooks } from "node:module";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import React, { act } from "react";
import TestRenderer from "react-test-renderer";
import ts from "typescript";

const read = (path) => readFileSync(path, "utf8");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mocks = {
  "@/lib/i18n/useI18n": "export const useI18n = () => ({locale:'en', t: key=>key});",
  "next/link": "export default function Link({children}) { return children; }",
  "@/components/marketplace/ActorMarketCard": "import React from 'react'; export const ActorMarketCard = ({actor}) => React.createElement('li', null, actor.name);",
  "supabase": "export const getSupabaseBrowserClient = () => globalThis.__marketTestClient;",
  "css": "export default {};",
};
registerHooks({
  resolve(specifier, context, next) {
    if (mocks[specifier]) return { url: `coze-test:${specifier}`, shortCircuit: true };
    if (specifier.endsWith('.css')) return { url: 'coze-test:css', shortCircuit: true };
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))) {
      const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      if (base === resolve(root, 'lib/supabase/client.ts') || base === resolve(root, 'lib/supabase/client')) return { url: 'coze-test:supabase', shortCircuit: true };
      for (const name of [base, `${base}.ts`, `${base}.tsx`]) if (existsSync(name)) return { url: pathToFileURL(name).href, shortCircuit: true };
    }
    return next(specifier, context.parentURL?.startsWith('coze-test:') ? { ...context, parentURL: import.meta.url } : context);
  },
  load(url, context, next) {
    if (url.startsWith('coze-test:')) return { format: 'module', shortCircuit: true, source: mocks[url.slice('coze-test:'.length)] };
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { ActorMarketSection } = await import('../components/marketplace/ActorMarketSection.tsx');

test("market waits for session hydration and uses the latest browser token", async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.__marketTestClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'fresh-token' } } }) } };
  globalThis.fetch = async (url, init) => {
    requests.push(new Headers(init.headers).get('authorization'));
    return Response.json({ success: true, actors: [{ actor: { id:'a', name:'Market Actor' } }], total:1 });
  };
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(ActorMarketSection, { viewerToken: null, sessionLoaded:false })); });
    assert.equal(requests.length, 0);
    await act(async () => renderer.update(React.createElement(ActorMarketSection, { viewerToken:'stale-token', sessionLoaded:true })));
    assert.deepEqual(requests, ['Bearer fresh-token']);
    assert.match(JSON.stringify(renderer.toJSON()), /Market Actor/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = originalFetch; delete globalThis.__marketTestClient; }
});

test("late marketplace 401 cannot overwrite a newer authenticated success", async () => {
  const originalFetch = globalThis.fetch;
  let release;
  let calls = 0;
  globalThis.__marketTestClient = { auth: {
    getSession: async () => ({ data: { session: { access_token:'token' } } }),
    refreshSession: async () => ({ data: { session:null } }),
  } };
  globalThis.fetch = async () => {
    if (++calls === 1) return new Promise(resolveResponse => { release = () => resolveResponse(Response.json({ success:false, error:'请先登录。' }, {status:401})); });
    return Response.json({ success:true, actors:[{ actor:{ id:'b', name:'Current Actor' } }], total:1 });
  };
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(ActorMarketSection, { viewerToken:'old', sessionLoaded:true })); });
    await act(async () => renderer.update(React.createElement(ActorMarketSection, { viewerToken:'new', sessionLoaded:true })));
    await act(async () => release());
    assert.match(JSON.stringify(renderer.toJSON()), /Current Actor/);
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /请先登录/);
  } finally { await act(async () => renderer?.unmount()); globalThis.fetch = originalFetch; delete globalThis.__marketTestClient; }
});

test("已购演员页不因 SSR 缺少 cookie 直接重定向，并使用 auth retry 拉取", () => {
  const page = read("app/actors/purchased/page.tsx");
  const client = read("app/actors/purchased/PurchasedActorsClient.tsx");
  assert.match(client, /fetchWithAuthRetry/);
  assert.doesNotMatch(page, /if\s*\(!viewer\)\s*\{\s*redirect\("\/login"\)/s);
  assert.match(client, /getSupabaseBrowserClient/);
});

test("演员市场详情和购买操作使用请求级/浏览器级认证事实源", () => {
  const marketRoute = read("app/api/actors/[actorId]/market/route.ts");
  const detail = read("components/marketplace/ActorMarketDetail.tsx");
  const actorPage = read("app/actors/[actorId]/page.tsx");
  assert.match(marketRoute, /getViewerFromRequest/);
  assert.match(marketRoute, /getViewerFromRequest\(request\)/);
  assert.match(detail, /fetchWithAuthRetry/);
  assert.match(actorPage, /fetchWithAuthRetry/);
});

test("任务中心展示最后成功更新时间，并把任务操作纳入认证重试路径", () => {
  const taskCenter = read("components/v2/task-center/TaskCenter.tsx");
  assert.match(taskCenter, /lastUpdatedAt/);
  assert.match(taskCenter, /最后更新|Last updated/);
  assert.match(taskCenter, /fetchWithAuthRetry/);
  assert.doesNotMatch(taskCenter, /\?\s*\{\s*Authorization:\s*`Bearer \$\{session\.access_token\}`\s*\}:\s*\{\}\s*,\s*\n\s*\.\.\.\(session\?\.access_token/);
});

test("社区发现失败时通过统一空状态提供当前分区重试入口", async () => {
  const feed = read("components/v2/community/DiscoveryFeed.tsx");
  assert.match(feed, /\{error \? \([\s\S]*?<CommunityEmptyState[\s\S]*?actionLabel=\{isZh \? "重试" : "Retry"\}[\s\S]*?onAction=\{retryCurrentSection\}/);
  assert.match(feed, /function retryCurrentSection\(\)[\s\S]*?loadRemoteSection\(activeSection, false, query\)/);
  assert.doesNotMatch(feed, /loadPersonalSection/);
  const { CommunityEmptyState } = await import('../components/v2/community/CommunityEmptyState.tsx');
  let retries = 0;
  let renderer;
  try {
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(CommunityEmptyState, {
        title: 'Community unavailable', body: 'Try again', error: true,
        actionLabel: 'Retry', onAction: () => { retries += 1; },
      }));
    });
    const button = renderer.root.findByType('button');
    assert.match(JSON.stringify(button.children.filter(child => typeof child === 'string')), /Retry/);
    await act(async () => button.props.onClick());
    assert.equal(retries, 1);
  } finally {
    await act(async () => renderer?.unmount());
  }
});
