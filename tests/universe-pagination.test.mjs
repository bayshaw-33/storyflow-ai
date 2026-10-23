import assert from 'node:assert/strict';
import test from 'node:test';
import { readAllUniverseRows } from '../lib/server/universe/read-all.ts';

test('universe aggregates read every page with scope and stable ordering', async () => {
  const rows = Array.from({length: 1005}, (_, id) => ({id}));
  const calls = [];
  const result = await readAllUniverseRows(async path => {
    const url = new URL(path, 'https://db.test'); calls.push(url);
    const offset = Number(url.searchParams.get('offset'));
    return rows.slice(offset, offset + Number(url.searchParams.get('limit')));
  }, '/rest/v1/entities?universe_id=eq.owner-universe&select=id');
  assert.equal(result.length,1005);
  assert.equal(calls.length,3);
  for (const url of calls) {
    assert.equal(url.searchParams.get('universe_id'),'eq.owner-universe');
    assert.equal(url.searchParams.get('order'),'id.asc');
  }
});

test('universe page failure never returns partial counts as success', async () => {
  let calls=0;
  await assert.rejects(readAllUniverseRows(async()=>{
    if (++calls===2) throw new Error('second page failed');
    return Array.from({length:500},(_,id)=>({id}));
  }, '/rest/v1/entities?universe_id=eq.owner-universe'), /second page failed/);
});
