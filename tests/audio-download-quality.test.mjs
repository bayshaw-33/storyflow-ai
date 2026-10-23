import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks, createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import ffmpeg from 'ffmpeg-static';
import { readMp3Encoding } from '../lib/audio/mp3-export.ts';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
registerHooks({
 resolve(specifier,context,next){
  if(specifier==='@/lib/supabase/server') return {url:'audio-quality:server',shortCircuit:true};
  if(specifier==='next/server') return {url:pathToFileURL(require.resolve('next/server.js')).href,shortCircuit:true};
  if(specifier.startsWith('@/')) { const base=resolve(root,specifier.slice(2)); for(const file of [base+'.ts',base+'/index.ts']) if(existsSync(file)) return {url:pathToFileURL(file).href,shortCircuit:true}; }
  return next(specifier,context);
 },
 load(url,context,next){if(url==='audio-quality:server') return {format:'module',shortCircuit:true,source:`export const authenticateRequest=(...a)=>globalThis.audioQualityMocks.auth(...a);export const serviceFetch=(...a)=>globalThis.audioQualityMocks.query(...a);export const getSupabaseServerClient=()=>globalThis.audioQualityMocks.client;`};return next(url,context);}
});
const {GET}=await import('../app/api/audio/jobs/[jobId]/download/route.ts');
function setup(source=new Uint8Array()){
 const files=new Map([['owner/job.mp3',source]]); const reads=[];const writes=[];const signed=[];
 globalThis.audioQualityMocks={
  auth:async()=>({id:'owner'}),
  query:async(path)=>{assert.match(path,/owner_id=eq.owner/);return [{id:'job',storage_path:'owner/job.mp3',input_params:{title:'My song'}}];},
  client:{storage:{from:()=>({
   download:async(path)=>{reads.push(path);return files.has(path)?{data:new Blob([files.get(path)]),error:null}:{data:null,error:{message:'not found'}};},
   upload:async(path,bytes)=>{writes.push(path);files.set(path,bytes);return {error:null};},
   createSignedUrl:async(path,_ttl,options)=>{signed.push({path,options});return {data:{signedUrl:'https://storage.test/download'},error:null};},
  })}},
 };
 return {files,reads,writes,signed};
}
const request=(query='')=>new Request('https://kiikis.test/api/audio/jobs/job/download'+query);
const context={params:Promise.resolve({jobId:'job'})};
test('default download exports and caches verified 320 kbps; original download does not transcode',async()=>{
 const {stdout}=await promisify(execFile)(ffmpeg,['-f','lavfi','-i','sine=frequency=440:duration=1','-c:a','libmp3lame','-b:a','192k','-f','mp3','pipe:1'],{encoding:'buffer',maxBuffer:1024*1024});
 const state=setup(stdout);
 const response=await GET(request(),context);assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.bitrate,320000);assert.equal(body.reencoded,true);assert.match(body.filename,/-320kbps.mp3$/);
 assert.equal(readMp3Encoding(state.files.get('owner/job.mp3.320k-v1.mp3')).bitrate,320000);
 assert.deepEqual(state.files.get('owner/job.mp3'),stdout);
 await GET(request(),context);assert.equal(state.writes.length,1,'second download reuses verified export');
 state.reads.length=0;
 const original=await (await GET(request('?format=original'),context)).json();
 assert.equal(original.filename,'My song.mp3');assert.equal(state.reads.length,0);
 assert.equal(state.signed.at(-1).path,'owner/job.mp3');
});
test('download rejects non-owned jobs before reading storage',async()=>{
 const state=setup();globalThis.audioQualityMocks.query=async()=>[];
 assert.equal((await GET(request(),context)).status,404);assert.equal(state.reads.length,0);
});
test('encoding failure is explicit and never silently falls back to a low-bitrate file',async()=>{
 const state=setup(new TextEncoder().encode('invalid audio'));
 assert.equal((await GET(request(),context)).status,502);assert.equal(state.signed.length,0);
});
test('speech downloads keep their original format unless MP3 export is explicitly requested',async()=>{
 const state=setup();globalThis.audioQualityMocks.query=async()=>[{id:'job',storage_path:'owner/job.mp3',input_params:{kind:'tts'}}];
 const body=await(await GET(request(),context)).json();
 assert.equal(body.format,'original');assert.equal(state.reads.length,0);
});
