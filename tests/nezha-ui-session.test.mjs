import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import React, { act } from 'react';
import TestRenderer from 'react-test-renderer';
import ts from 'typescript';
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.document = { title: "" };
globalThis.window = { location: { search: "" }, addEventListener(){}, removeEventListener(){} };
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mocks = {
  '@/lib/supabase/projects': 'export const readProjectsFromSupabase = async () => [];',
  '@/lib/i18n/useI18n': "export const useI18n=()=>({locale:globalThis.__nezhaLocale||'zh-CN',t:key=>key});",
  'next/link': "export default function Link({children}) {return children;}",
  '@/components/design/DesignAssetImage': "export const DesignAssetImage = () => null;",
  'css': 'export default {};',
  'next/navigation': `const router={push(){},replace(href){globalThis.__nezhaRedirect?.(href);}}; export const useRouter = () => router; export const useSearchParams = () => new URLSearchParams(globalThis.__nezhaQuery ?? 'projectId=project');`,
  '@/lib/supabase/client': 'export const getSupabaseBrowserClient = () => globalThis.__nezhaClient;',
};
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith('.css')) return {url:'nezha:css',shortCircuit:true};
    if (mocks[specifier]) return {url:`nezha:${specifier}`, shortCircuit:true};
    if (specifier.includes('supabase/client')) return {url:'nezha:@/lib/supabase/client',shortCircuit:true};
    if (specifier.startsWith('@/') || (specifier.startsWith('.') && context.parentURL?.startsWith('file:'))) {
      const base = specifier.startsWith('@/') ? resolve(root,specifier.slice(2)) : resolve(dirname(fileURLToPath(context.parentURL)),specifier);
      for (const file of [base,`${base}.ts`,`${base}.tsx`]) if (existsSync(file)) return {url:pathToFileURL(file).href,shortCircuit:true};
    }
    return next(specifier, context.parentURL?.startsWith('nezha:') ? {...context,parentURL:import.meta.url}:context);
  },
  load(url,context,next) {
    if (url.startsWith('nezha:')) return {format:'module',shortCircuit:true,source:mocks[url.slice(6)]};
    if (/\.tsx?$/.test(url)) return {format:'module',shortCircuit:true,source:ts.transpileModule(readFileSync(new URL(url),'utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext}}).outputText};
    return next(url,context);
  }
});
const {default:CardDraw} = await import('../app/card-draw/page.tsx');
const {CastingPanel} = await import('../components/production/CastingPanel.tsx');
const {SourceEpisodePicker} = await import('../components/production/SourceEpisodePicker.tsx');
const {AssetsPanel} = await import('../components/v2/universe/AssetsPanel.tsx');
const {VersionHistory} = await import('../components/production/VersionHistory.tsx');
const {CommunityFilters} = await import('../components/v2/community/CommunityFilters.tsx');
test('source episode selection reads the chosen finalized version and excludes drafts and other document types',async()=>{
 const original=globalThis.fetch;let view;const requests=[];const selected=[];
 globalThis.fetch=async(url,init)=>{requests.push([String(url),init?.method||'GET']);return Response.json(String(url).includes('?version=finalized')?{success:true,unit:{id:'ep-2'},content:{body:'final episode two'}}:{success:true,units:[{id:'ep-1',title:'第一集',type:'episode',finalizedVersionId:'v1'},{id:'ep-2',title:'第二集',type:'episode',finalizedVersionId:'v2'},{id:'draft',type:'episode',finalizedVersionId:null},{id:'outline',type:'outline',finalizedVersionId:'v3'}]});};
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(SourceEpisodePicker,{workId:'script-work',unitId:'ep-1',onSelect:(...args)=>selected.push(args)}));});
  assert.deepEqual(view.root.findAllByType('option').map(node=>node.props.value),['','ep-1','ep-2']);
  await act(async()=>view.root.findByType('select').props.onChange({target:{value:'ep-2'}}));
  assert.deepEqual(selected,[['ep-2','final episode two']]);
  assert.ok(requests.at(-1)[0].includes('/units/ep-2?version=finalized'));
  assert.ok(requests.every(([,method])=>method==='GET'));
 }finally{await act(async()=>view?.unmount());globalThis.fetch=original;}
});
test('asset empty states distinguish no entities from no matches and disambiguate equal names',async()=>{
 let view;const previous=globalThis.__nezhaClient;globalThis.__nezhaClient=null;
 const empty={universe:{id:'universe'},characters:[],locations:[],organizations:[],props:[],concepts:[]};
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(AssetsPanel,{bundle:empty}));});
  assert.match(JSON.stringify(view.toJSON()),/还没有角色、地点或其他资产/);
  const row={name:'同名角色',summary:'summary',status:'draft',usedBy:[]};
  await act(async()=>view.update(React.createElement(AssetsPanel,{bundle:{...empty,characters:[{...row,id:'character-11111111'},{...row,id:'character-22222222'}]}})));
  const identifiers=view.root.findAllByType('small').map(node=>node.children.join(''));
  assert.ok(identifiers.includes('#11111111'));assert.ok(identifiers.includes('#22222222'));
  await act(async()=>view.root.findByType('input').props.onChange({target:{value:'no match'}}));
  assert.match(JSON.stringify(view.toJSON()),/没有匹配的资产/);
 }finally{await act(async()=>view?.unmount());globalThis.__nezhaClient=previous;}
});
test('version controls follow the UI language, including their accessible label',async()=>{
 let view;
 const props={versions:[{id:'v1',versionNo:1,source:'manual',entityType:'production_workbench',createdAt:'2026-10-23T00:00:00Z'}],loading:false,error:null,onSelect(){},onRestore(){},onCompare(){},diff:null,selectedVersionId:null,onClose(){}};
 try{
  globalThis.__nezhaLocale='en-US';
  await act(async()=>{view=TestRenderer.create(React.createElement(VersionHistory,props));});
  assert.match(JSON.stringify(view.toJSON()),/Manual save/);
  assert.equal(view.root.findAllByType('button')[0].props['aria-label'],'Close version history');
  globalThis.__nezhaLocale='zh-CN';
  await act(async()=>view.update(React.createElement(VersionHistory,props)));
  assert.match(JSON.stringify(view.toJSON()),/手动保存/);
  assert.equal(view.root.findAllByType('button')[0].props['aria-label'],'关闭版本历史');
 }finally{await act(async()=>view?.unmount());delete globalThis.__nezhaLocale;}
});
test('clearing community search submits the empty query instead of the stale previous value',async()=>{
 let view;const events=[];
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(CommunityFilters,{locale:'zh-CN',section:'recommended',query:'old search',onQueryChange:value=>events.push(['change',value]),onQuerySubmit:value=>events.push(['submit',value])}));});
  await act(async()=>view.root.findByType('button').props.onClick());
  assert.deepEqual(events,[['change',''],['submit','']]);
 }finally{await act(async()=>view?.unmount());}
});
const {DirectorPageClient} = await import('../app/director/DirectorPageClient.tsx');
const {AudioCandidates} = await import('../components/song-workbench/AudioCandidates.tsx');
test('audio player distinguishes unknown duration from real metadata', async () => {
 let view;
 try {
  await act(async()=>{view=TestRenderer.create(React.createElement(AudioCandidates, {
   candidates:[{id:'audio-1',label:'A',status:'completed',resultUrl:'https://cdn.test/song.mp3',createdAt:'2026-10-23'}],
   documents:[],musicModels:[],musicMode:'vocal',voiceGender:'unrestricted',isZh:true,busy:false,onGenerate(){},onDownload:async()=>{},
  }));});
  const player=view.root.findByType('audio');
  assert.equal(player.props.preload,'metadata');
  assert.match(JSON.stringify(view.toJSON()),/--:--/);
  await act(async()=>player.props.onLoadedMetadata({currentTarget:{duration:125}}));
  assert.match(JSON.stringify(view.toJSON()),/2:05/);
  await act(async()=>player.props.onDurationChange({currentTarget:{duration:Infinity}}));
  assert.match(JSON.stringify(view.toJSON()),/--:--/);
 }finally{await act(async()=>view?.unmount());}
});
test('director preserves project/work/unit scope and opens unified motion preview', async () => {
 let view; const urls=[];
 globalThis.__nezhaQuery='projectId=project-1&workId=work-1&sourceUnitId=unit-1';
 globalThis.__nezhaRedirect=href=>urls.push(href);
 try {
  await act(async()=>{view=TestRenderer.create(React.createElement(DirectorPageClient));});
  assert.equal(urls.length,1);
  const url=new URL(urls[0],'https://kiikis.test');
  assert.equal(url.pathname,'/production');
  for(const [key,value] of Object.entries({projectId:'project-1',workId:'work-1',unitId:'unit-1',tab:'storyboard',view:'motion'})) assert.equal(url.searchParams.get(key),value);
 }finally{await act(async()=>view?.unmount());delete globalThis.__nezhaQuery;delete globalThis.__nezhaRedirect;}
});
const session={access_token:'valid-token',user:{id:'owner'}};
globalThis.__nezhaClient={auth:{getSession:async()=>({data:{session}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}};
test('card draw settles after one history request and enables its CTA',async()=>{
  const original=globalThis.fetch; let calls=0; let view;
  globalThis.fetch=async()=>{if(++calls>4) return new Promise(()=>{}); return Response.json({success:true,draws:[]});};
  try {
    await act(async()=>{view=TestRenderer.create(React.createElement(CardDraw));});
    assert.equal(calls,1,'history must not refetch on loading/render state changes');
    const button=view.root.findAllByType('button').find(b=>b.children.includes('开始抽卡'));
    assert.ok(button);assert.equal(button.props.disabled,false);
  } finally {await act(async()=>view?.unmount());globalThis.fetch=original;}
});
test('casting uses current session token; draft scope sends no API request',async()=>{
  const original=globalThis.fetch;const requests=[];let view;
  globalThis.fetch=async(url,init)=>{requests.push([url,new Headers(init?.headers).get('Authorization')]);return Response.json({success:true,characters:[],actors:[]});};
  try {
    await act(async()=>{view=TestRenderer.create(React.createElement(CastingPanel,{projectId:'project',casting:{},onCastingChange(){}}));});
    assert.equal(requests[0][1],'Bearer valid-token');
    await act(async()=>view.update(React.createElement(CastingPanel,{projectId:'draft',casting:{},onCastingChange(){}})));
    assert.equal(requests.length,1);
    assert.match(JSON.stringify(view.toJSON()),/选择.*项目|正式项目/);
  }finally{await act(async()=>view?.unmount());globalThis.fetch=original;}
});

const {MonetizationLayer} = await import('../components/pricing/MonetizationLayer.tsx');
const {UsernameField} = await import('../components/settings/UsernameField.tsx');
test('subscription highlights the saved current plan on entry',async()=>{
 const original=globalThis.__nezhaClient;let view;
 globalThis.__nezhaClient={...original,from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{plan:'elite'},error:null})})})})};
 try{await act(async()=>{view=TestRenderer.create(React.createElement(MonetizationLayer));});
  const selected=view.root.findAll(node=>node.props['data-tier']==='ELITE' && node.props.className?.includes('is-selected'));
  assert.equal(selected.length,1);
 }finally{await act(async()=>view?.unmount());globalThis.__nezhaClient=original;}
});
test('username does not show invalid state until edited or checked',async()=>{
 let view;
 try{await act(async()=>{view=TestRenderer.create(React.createElement(UsernameField,{value:'',onChange(){},currentUsername:null}));});
 assert.doesNotMatch(JSON.stringify(view.toJSON()),/3-20 个字符/);
 }finally{await act(async()=>view?.unmount());}
});
const {ProjectStartFlow} = await import('../components/v2/project-start/ProjectStartFlow.tsx');
test('new Video confirmation finishes Universe loading instead of cancelling its own request', async()=>{
 const original=globalThis.fetch; let view; let release;
 globalThis.fetch=async()=>new Promise(resolve=>{release=()=>resolve(Response.json({success:true,universes:[{id:'u1',name:'测试宇宙'}]}));});
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(ProjectStartFlow));});
  const button=view.root.findAllByType('button').find(b=>b.findAllByType('h3').some(h=>h.children.includes('视频')));
  assert.ok(button);
  await act(async()=>button.props.onClick());
  await act(async()=>release());
  const select=view.root.findByProps({'data-testid':'project-universe-select'});
  assert.equal(select.props.disabled,false);
  assert.match(JSON.stringify(select.toJSON?.() || select.findAllByType('option').map(n=>n.children)),/测试宇宙/);
 }finally{await act(async()=>view?.unmount());globalThis.fetch=original;}
});
const {BillingSummary} = await import('../components/pricing/BillingSummary.tsx');
test('billing distinguishes no subscription from billing service failure',async()=>{
 const original=globalThis.fetch;let view;
 try{
  globalThis.fetch=async()=>Response.json({success:true,subscription:null});
  await act(async()=>{view=TestRenderer.create(React.createElement(BillingSummary));});
  assert.match(JSON.stringify(view.toJSON()),/未关联付费订阅/);
  await act(async()=>view.unmount());view=null;
  globalThis.fetch=async()=>Response.json({success:false,code:'service_unavailable'},{status:503});
  await act(async()=>{view=TestRenderer.create(React.createElement(BillingSummary));});
  assert.match(JSON.stringify(view.toJSON()),/账单服务暂时不可用/);
  assert.doesNotMatch(JSON.stringify(view.toJSON()),/暂无订阅账单/);
 }finally{await act(async()=>view?.unmount());globalThis.fetch=original;}
});

const {default: ArtWorkbench} = await import('../components/art/ArtWorkbench.tsx');
test('opening standalone art does not allocate or persist a draft before Start',async()=>{
 const originalFetch=globalThis.fetch;const originalStorage=globalThis.localStorage;const previousLocation=window.location;const previousHistory=window.history;let view;const writes=[];const urls=[];
 const data=new Map();
 globalThis.localStorage={getItem:key=>data.get(key)||null,setItem:(key,value)=>{data.set(key,value);writes.push(key);},removeItem:key=>data.delete(key),key:index=>[...data.keys()][index],get length(){return data.size;}};
 window.localStorage=globalThis.localStorage;window.location={search:'',href:'http://local.test/art-workbench'};window.history={replaceState:(_a,_b,url)=>urls.push(String(url))};
 globalThis.fetch=async()=>Response.json({success:true,draft:null,models:[]});
 try{
  await act(async()=>{view=TestRenderer.create(React.createElement(ArtWorkbench));});
  assert.equal(urls.filter(url=>url.includes('draftId=')).length,0);
  assert.equal(writes.filter(key=>key.includes('kiikis_art_workbench_state')).length,0);
  assert.match(JSON.stringify(view.toJSON()),/开始美术创作/);
  const start=view.root.findAllByType('button').find(button=>button.children.includes('开始美术创作'));
  await act(async()=>start.props.onClick());
  assert.equal(urls.filter(url=>url.includes('draftId=')).length,1);
  assert.ok(writes.some(key=>key.includes('kiikis_art_workbench_state')));
 }finally{await act(async()=>view?.unmount());globalThis.fetch=originalFetch;globalThis.localStorage=originalStorage;window.location=previousLocation;window.history=previousHistory;}
});
