import assert from 'node:assert/strict';
import test from 'node:test';
import {readStoryboardSubview,updateStoryboardSubview} from '../lib/storyboard/subview.ts';
test('all storyboard subviews survive URL updates and reloads with legacy parameters present',()=>{
 for(const view of ['shot_table','grids','motion','prompts','canvas']) {
  const next=updateStoryboardSubview(new URLSearchParams('projectId=p&workId=w&unitId=u&storyboardView=shots'),view);
  assert.equal(readStoryboardSubview(next),view);assert.equal(next.has('storyboardView'),false);
  assert.equal(next.get('unitId'),'u');assert.equal(next.get('workId'),'w');
 }
 assert.equal(readStoryboardSubview(new URLSearchParams('view=canvas&storyboardView=shots')),'canvas');
 assert.equal(readStoryboardSubview(new URLSearchParams('storyboardView=grid')),'grids');
});
