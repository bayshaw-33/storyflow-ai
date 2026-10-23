import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='@/lib/supabase/server')return {url:'actor-market:server',shortCircuit:true};
  return next(specifier,context);
},load(url,context,next){
  if(url==='actor-market:server')return {format:'module',shortCircuit:true,source:`export const hasServiceRoleConfig=()=>true;export const serviceFetch=(...args)=>globalThis.actorMarketFetcher(...args);`};
  return next(url,context);
}});
const {listPlatformActors}=await import('../lib/supabase/actor-usages.ts');
const actors=[
 {id:'a',name:'Latest',owner_id:'owner-a',visibility:'platform',updated_at:'2026-10-23'},
 {id:'b',name:'Older',owner_id:'owner-b',visibility:'platform',updated_at:'2026-10-22'},
 {id:'c',name:'Popular',owner_id:'owner-c',visibility:'platform',updated_at:'2026-10-21'},
];
function setup(){
 globalThis.actorMarketFetcher=async path=>{
  const url=new URL(path,'https://db.test');
  if(url.pathname.endsWith('/storyflow_actor_profiles')){
   assert.equal(url.searchParams.get('visibility'),'eq.platform');
   assert.equal(url.searchParams.get('status'),'neq.archived');
   const rows=url.searchParams.has('or')?actors.filter(actor=>actor.name==='Older'):[...actors];
   const offset=Number(url.searchParams.get('offset')||0);const limit=Number(url.searchParams.get('limit')||1000);
   return rows.slice(offset,offset+limit);
  }
  if(url.pathname.endsWith('/storyflow_actor_usages'))return [{actor_id:'a'},{actor_id:'c'},{actor_id:'c'},{actor_id:'c'}];
  if(url.pathname.endsWith('/storyflow_profiles'))return [];
  throw new Error('unexpected read');
 };
}
test('popular actors sort globally before paging and expose only the public card DTO',async()=>{
 setup();const result=await listPlatformActors({sort:'popular',pageSize:1,page:1});
 assert.equal(result.actors[0].actor.id,'c');assert.equal(result.actors[0].usage_count,3);assert.equal(result.total,3);
 assert.equal(result.actors[0].actor.owner_id,undefined);
});
test('actor search counts use the same filter as the page',async()=>{
 setup();const result=await listPlatformActors({search:'Older',pageSize:1});
 assert.equal(result.total,1);assert.equal(result.actors[0].actor.name,'Older');
});
