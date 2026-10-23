import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync,readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve,dirname } from 'node:path';
import { fileURLToPath,pathToFileURL } from 'node:url';
import React,{act} from 'react';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
registerHooks({
 resolve(specifier,context,next){
  if(['next/link','next/navigation','@/lib/i18n/useI18n'].includes(specifier)) return {url:`nav-restoration:${specifier}`,shortCircuit:true};
  if(specifier.startsWith('@/')){const base=resolve(root,specifier.slice(2));for(const file of [base+'.ts',base+'.tsx'])if(existsSync(file))return {url:pathToFileURL(file).href,shortCircuit:true};}
  return next(specifier,context.parentURL?.startsWith('nav-restoration:')?{...context,parentURL:import.meta.url}:context);
 },
 load(url,context,next){
  if(url==='nav-restoration:next/link')return {format:'module',shortCircuit:true,source:`import React from 'react';export default function Link(props){return React.createElement('a',props,props.children);}`};
  if(url==='nav-restoration:next/navigation')return {format:'module',shortCircuit:true,source:`export const usePathname=()=>globalThis.navigationRestorePath||'/';`};
  if(url==='nav-restoration:@/lib/i18n/useI18n')return {format:'module',shortCircuit:true,source:`export const useI18n=()=>({locale:'zh-CN',t:key=>({'nav.home':'首页','nav.dashboard':'工作台','nav.universe':'宇宙','nav.actors':'演员库','nav.community':'社区','nav.pricing':'订阅','nav.settings':'设置'}[key]||key)});`};
  if(/\.tsx?$/.test(url))return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText};
  return next(url,context);
 }
});
const {GlobalSideNav}=await import('../components/layout/GlobalSideNav.tsx');
test('home retains primary navigation; Workbench expands exactly the eight established creation entries',async()=>{
 let view;
 try {
  await act(async()=>{view=TestRenderer.create(React.createElement(GlobalSideNav));});
  assert.equal(view.root.findByType('nav').props.className,'kk-nav-vertical');
  const submenu=()=>view.root.findByType('ul');
  assert.equal(submenu().props.hidden,true);
  const workbench=view.root.findAllByType('a').find(link=>link.props.href==='/dashboard');
  await act(async()=>workbench.props.onClick());
  assert.equal(submenu().props.hidden,false);
  const links=submenu().findAllByType('a');
  assert.deepEqual(links.map(link=>link.children.join('')),['剧本','歌曲','美术','分镜','视频','配音','剪辑','改编']);
  assert.ok(links.every(link=>link.props.href.startsWith('/projects/new-v2?type=')||link.props.href==='/viral-workbench?setup=1'));
  const primary=view.root.findByType('nav').findAllByType('a').map(link=>link.props.href);
  for(const href of ['/production','/card-draw','/job-center','/kk']) assert.ok(!primary.includes(href));
  await act(async()=>view.root.findByType('button').props.onClick());
  assert.equal(submenu().props.hidden,true);
 }finally{await act(async()=>view?.unmount());}
});

test('navigation keeps its fixed desktop placement and original mobile breakpoint without shifting the entire page',()=>{
 const css=readFileSync(resolve(root,'app/globals.css'),'utf8');
 assert.match(css,/\.kk-nav-vertical\s*\{[^}]*position:\s*fixed/);
 assert.match(css,/@media\s*\(max-width:\s*768px\)\s*\{\s*\.kk-nav-vertical,\s*\.kk-nav-settings-corner\s*\{\s*display:\s*none/);
 assert.doesNotMatch(css,/\.kk-page-content/);
});
