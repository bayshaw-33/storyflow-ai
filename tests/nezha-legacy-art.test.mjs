import assert from 'node:assert/strict';
import test from 'node:test';
import {loadLegacyArtDraft} from '../lib/art/legacy-project.ts';
const projectId='11111111-1111-4111-8111-111111111111';
test('legacy art opens its persisted project, variants and versions without creating a new project',async()=>{
 const calls=[];
 const draft=await loadLegacyArtDraft('owner',projectId,async(path,init)=>{
  calls.push({path,init});
  if(path.includes('storyflow_art_projects?')){assert.match(path,/owner_id=eq.owner/);return [{id:projectId,name:'已保存的美术',visual_style:'写实',updated_at:'2026-10-23T00:00:00Z'}];}
  if(path.includes('storyflow_art_assets?'))return [{id:'asset',kind:'character',name:'主角',narrative_role:'lead',description:'人物设定',updated_at:'2026-10-23T00:00:00Z'}];
  if(path.includes('storyflow_art_asset_variants?'))return [{id:'variant',asset_id:'asset',name:'母版',variant_type:'master',approved_version_id:'version'}];
  if(path.includes('storyflow_art_asset_versions?'))return [{id:'version',variant_id:'variant',storage_path:'owner/project/image.png',source:'generated',prompt:'主角肖像',created_at:'2026-10-23T00:00:00Z'}];
  throw new Error(path);
 },async path=>`signed:${path}`);
 assert.equal(draft.state.id,`legacy-art-${projectId}`);
 assert.equal(draft.state.title,'已保存的美术');
 assert.equal(draft.state.assets[0].variants[0].approvedVersionId,'version');
 assert.equal(draft.state.assets[0].variants[0].versions[0].imageUrl,'signed:owner/project/image.png');
 assert.ok(calls.every(call=>!call.init?.method || call.init.method==='GET'));
});
test('legacy art loader stops before reading assets if the project is not owned',async()=>{
 let calls=0;
 await assert.rejects(loadLegacyArtDraft('owner',projectId,async()=>{calls++;return[];},async()=>''),/LEGACY_ART_PROJECT_NOT_FOUND/);
 assert.equal(calls,1);
});
