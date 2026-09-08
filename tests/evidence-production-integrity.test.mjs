import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';
import { createHash } from 'node:crypto';
import { materializeEvidencePackageV2 } from '../lib/server/v2/evidence/package-v2.ts';

const input = {ownerId:'owner',projectId:'project',workId:'work'};
const unitVersion = {id:'uv1',unit_id:'u1',content_json:{body:'世界观正文'},content_hash:'a'.repeat(64),created_at:'2026-09-06T00:00:00Z'};
function fetcher(path) {
  if(path.includes('screenplay_unit_versions')) return [unitVersion];
  if(path.includes('screenplay_units')) return [{id:'u1',type:'world',current_version_id:'uv1',finalized_version_id:'uv1'}];
  if(path.includes('conversation_messages')) return [{id:'m1',thread_id:'t1',role:'user',content:'我的原创设定',created_at:'2026-09-06T00:00:00Z'}];
  return [];
}
test('evidence ZIP includes actual screenplay unit content and conversation, with exact hashes', async () => {
  let bytes;
  const store = { getPackageByManifestHash:async()=>null, upload:async(_,data)=>{bytes=data;},insertPackage:async row=>row };
  await materializeEvidencePackageV2(input, fetcher, store);
  const zip = await JSZip.loadAsync(bytes);
  const manifest = JSON.parse(await zip.file('manifest.json').async('string'));
  const texts = await Promise.all(Object.values(zip.files).filter(f=>!f.dir).map(f=>f.async('string')));
  assert.ok(texts.some(t=>t.includes('世界观正文')), 'unit versions must be in the ZIP');
  assert.ok(texts.some(t=>t.includes('我的原创设定')), 'actual messages, not just hashes');
  for(const file of manifest.files) {
    const data = await zip.file(file.archivePath).async('uint8array');
    assert.equal(file.byteSize,data.byteLength);
    assert.equal(file.sha256,createHash('sha256').update(data).digest('hex'));
  }
});
test('evidence errors fail closed instead of producing a success-shaped empty archive',async()=>{
  await assert.rejects(materializeEvidencePackageV2(input,async()=>{throw new Error('database unavailable');},{getPackageByManifestHash:async()=>null,upload:async()=>{},insertPackage:async x=>x}));
});
