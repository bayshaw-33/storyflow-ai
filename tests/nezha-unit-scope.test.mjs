import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveProjectSourceUnitId } from '../lib/production/source-unit.ts';
test('explicit unit is preserved, a unique finalized unit can be recovered, multiple units require selection',()=>{
 assert.equal(resolveProjectSourceUnitId({sourceUnitId:'selected'}),'selected');
 assert.equal(resolveProjectSourceUnitId({creationWorkspace:{screenplay:{units:[{id:'ep',status:'finalized'}]}}}),'ep');
 assert.equal(resolveProjectSourceUnitId({creationWorkspace:{screenplay:{units:[{id:'a',status:'finalized'},{id:'b',status:'finalized'}]}}}),null);
});
