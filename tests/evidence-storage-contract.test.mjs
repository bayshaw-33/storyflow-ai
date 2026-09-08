import test from 'node:test';
import assert from 'node:assert/strict';
import { createServerEvidencePackageV2Store } from '../lib/server/v2/evidence/package-v2.ts';

test('storage adapts generated project IDs losslessly and signs with the Storage JSON contract', async (t) => {
  const oldUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const oldKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://storage.example.test';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
  t.after(() => {
    if (oldUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = oldKey;
  });
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init) => {
    calls.push({url, init});
    return new Response(JSON.stringify(url.includes('/sign/') ? {signedURL:'/object/sign/evidence-artifacts/test.zip?token=test'} : [{...JSON.parse(init.body),id:'package'}]));
  });
  const store = createServerEvidencePackageV2Store();
  const row = {project_id:'proj_84894aca73464c0b89cfae6959355f05',work_id:'work',owner_id:'owner'};
  await store.insertPackage(row);
  assert.equal(JSON.parse(calls[0].init.body).project_id,'84894aca-7346-4c0b-89cf-ae6959355f05');
  assert.equal(row.project_id,'proj_84894aca73464c0b89cfae6959355f05');
  const signed = await store.sign('owner/v2-packages/test.zip',300);
  assert.deepEqual(JSON.parse(calls[1].init.body),{expiresIn:300});
  assert.equal(new URL(calls[1].url).pathname,'/storage/v1/object/sign/evidence-artifacts/owner/v2-packages/test.zip');
  assert.equal(signed.url,'https://storage.example.test/storage/v1/object/sign/evidence-artifacts/test.zip?token=test');
});
