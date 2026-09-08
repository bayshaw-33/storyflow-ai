import test from 'node:test';
import assert from 'node:assert/strict';
import { applyScreenplayPatches } from '../lib/server/v2/screenplays/patches.ts';
test('accepted patches replace the exact original text without dropping the rest',()=>{
  assert.equal(applyScreenplayPatches('第一幕\n旧对白\n第二幕',[{before:'旧对白',after:'新对白'}]),'第一幕\n新对白\n第二幕');
});
test('ambiguous or stale text fails rather than silently overwriting another paragraph',()=>{
  assert.throws(()=>applyScreenplayPatches('重复\n重复',[{before:'重复',after:'新内容'}]));
  assert.throws(()=>applyScreenplayPatches('现有正文',[{before:'旧正文',after:'新内容'}]));
});
test('new content appends to the selected unit, preserving existing content',()=>{
  assert.equal(applyScreenplayPatches('现有正文',[{before:'',after:'追加内容'}]),'现有正文\n\n追加内容');
});
