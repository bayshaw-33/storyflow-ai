import test from 'node:test';
import assert from 'node:assert/strict';
import {createAtlasProvider} from '../lib/ai/video/atlas.ts';
test('Seedance 2.0 submission sends signed first frame URL, exactly 4s / 720p and ratio',async()=>{
 const original=globalThis.fetch;const old=process.env.ATLASCLOUD_API_KEY;process.env.ATLASCLOUD_API_KEY='test-only';const calls=[];
 globalThis.fetch=async(url,init)=>{calls.push([url,JSON.parse(init.body)]);return Response.json({data:{id:'task'}});};
 try{
  await createAtlasProvider().submit({prompt:'move',firstframeUrl:'https://cdn.test/frame.png',duration:4,resolution:'720p',aspectRatio:'9:16',model:'bytedance/seedance-2.0/image-to-video'});
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0][1],{model:'bytedance/seedance-2.0/image-to-video',image:'https://cdn.test/frame.png',prompt:'move',duration:4,resolution:'720p',ratio:'9:16',generate_audio:false});
 }finally{globalThis.fetch=original;if(old===undefined)delete process.env.ATLASCLOUD_API_KEY;else process.env.ATLASCLOUD_API_KEY=old;}
});
