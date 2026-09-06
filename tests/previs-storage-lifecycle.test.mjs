import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';
import { createDefaultPrevisScene } from '../lib/director/previs.ts';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const threeUrl = import.meta.resolve('three');
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'three') return { url: 'previs-test:three', shortCircuit: true };
    if (specifier.includes('/controls/OrbitControls.js')) return { url: 'previs-test:controls', shortCircuit: true };
    if (specifier.endsWith('.css')) return { url: 'previs-test:css', shortCircuit: true };
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))) {
      const base = specifier.startsWith('@/') ? resolve(root, specifier.slice(2)) : resolve(dirname(fileURLToPath(context.parentURL)), specifier);
      for (const path of [base, `${base}.ts`, `${base}.tsx`]) {
        if (existsSync(path)) return { url: pathToFileURL(path).href, shortCircuit: true };
      }
    }
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'previs-test:three') return { format: 'module', shortCircuit: true, source: `export * from ${JSON.stringify(threeUrl)}; export class WebGLRenderer { setPixelRatio() {} setSize() {} render(scene) { globalThis.__previsRenderedScene = scene; } dispose() {} }` };
    if (url === 'previs-test:controls') return { format: 'module', shortCircuit: true, source: 'export class OrbitControls { target = { set() {} }; update() {} dispose() {} }' };
    if (url === 'previs-test:css') return { format: 'module', shortCircuit: true, source: 'export default {};' };
    if (url.endsWith('.tsx')) return { format: 'module', shortCircuit: true, source: ts.transpileModule(readFileSync(new URL(url), 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext } }).outputText };
    return next(url, context);
  },
});
const { WhiteModelPrevis } = await import('../components/production/WhiteModelPrevis.tsx');
const key = unit => `kiikis:previs:v1:test-project:test-work:${unit}`;
const props = unitId => ({ projectId: 'test-project', workId: 'test-work', unitId, storyboardClient: {}, storyboardRevision: 0, onPrevisAdopted() {} });
const scene = name => {
  const value = createDefaultPrevisScene();
  value.objects[1].name = name;
  return value;
};

async function mountWithStorage(storage, run) {
  const originalWindow = globalThis.window;
  globalThis.window = { localStorage: storage };
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(WhiteModelPrevis, props('a'))); });
    await run(renderer);
  } finally {
    await act(async () => renderer?.unmount());
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
}

test('previs quota failure does not crash the workbench and reports unsaved changes', async () => {
  await mountWithStorage({ getItem: () => null, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } }, renderer => {
    assert.match(JSON.stringify(renderer.toJSON()), /未保存|无法保存/);
  });
});

test('switching previs units never writes the previous scene to the next unit', async () => {
  const values = new Map([[key('a'), JSON.stringify(scene('Unit A'))], [key('b'), JSON.stringify(scene('Unit B'))]]);
  const writes = [];
  await mountWithStorage({ getItem: k => values.get(k) ?? null, setItem(k, v) { writes.push([k, JSON.parse(v).objects[1].name]); values.set(k, v); } }, async renderer => {
    await act(async () => renderer.update(React.createElement(WhiteModelPrevis, props('b'))));
    assert.equal(writes.some(([k, name]) => k === key('b') && name === 'Unit A'), false);
    await act(async () => renderer.update(React.createElement(WhiteModelPrevis, props('c'))));
    assert.notEqual(JSON.parse(values.get(key('c'))).objects[1].name, 'Unit B');
  });
});

test('previs draws its objects when shot data arrives after mount', async () => {
  const previous = { window: globalThis.window, raf: globalThis.requestAnimationFrame, caf: globalThis.cancelAnimationFrame };
  let renderFrame;
  globalThis.window = { devicePixelRatio: 1, localStorage: { getItem: () => null, setItem() {} } };
  globalThis.requestAnimationFrame = fn => { renderFrame = fn; return 1; };
  globalThis.cancelAnimationFrame = () => {};
  let renderer;
  try {
    await act(async () => { renderer = TestRenderer.create(React.createElement(WhiteModelPrevis, props('a')), { createNodeMock: element => element.type === 'canvas' ? { clientWidth: 360, clientHeight: 640 } : null }); });
    await act(async () => renderer.update(React.createElement(WhiteModelPrevis, { ...props('a'), shotOptions: [{ shotId: 'late-shot' }] })));
    renderFrame(performance.now());
    const group = globalThis.__previsRenderedScene.children.find(child => child.type === 'Group');
    assert.ok(group.children.length > 0, 'room and actor must appear without another edit');
  } finally {
    await act(async () => renderer?.unmount());
    globalThis.window = previous.window;
    globalThis.requestAnimationFrame = previous.raf;
    globalThis.cancelAnimationFrame = previous.caf;
    delete globalThis.__previsRenderedScene;
  }
});

test('corrupt previs draft is not silently overwritten on mount or edit', async () => {
  const raw = '{broken draft';
  const values = new Map([[key('a'), raw]]);
  await mountWithStorage({ getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, async renderer => {
    assert.equal(values.get(key('a')), raw);
    assert.match(JSON.stringify(renderer.toJSON()), /草稿/);
    await act(async () => renderer.root.findByProps({ title: '添加人物替身' }).props.onClick());
    assert.equal(values.get(key('a')), raw);
  });
});

test('successful server save still reaches video when the optional local cache is full', async () => {
  const originalDocument = globalThis.document;
  globalThis.document = { body: { appendChild() {} }, createElement: () => ({ click() {}, remove() {} }) };
  const saved = { id: 'saved-version', snapshot: { schemaVersion: 1 } };
  const adopted = [];
  try {
    await mountWithStorage({ getItem: () => null, setItem(k) { if (!k.startsWith('kiikis:previs:v1:')) throw new DOMException('Full', 'QuotaExceededError'); } }, async renderer => {
      await act(async () => renderer.update(React.createElement(WhiteModelPrevis, {
        ...props('a'), shotOptions: [{ shotId: 'shot-1', sceneLabel: 'scene', shotLabel: 'shot' }],
        storyboardClient: { savePrevisVersion: async () => saved }, onPrevisAdopted: result => adopted.push(result),
      })));
      const button = renderer.root.findAllByType('button').find(button => button.children.includes('保存并送视频'));
      await act(async () => {
        button.props.onClick();
        await new Promise((resolve) => setImmediate(resolve));
      });
      assert.deepEqual(adopted, [saved]);
      assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /白模版本保存失败/);
    });
  } finally {
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
  }
});
