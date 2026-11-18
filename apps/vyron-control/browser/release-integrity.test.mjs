import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildIntegrityManifest,verifyPublicIntegrity,verifyProductionEventually,RELEASE_ASSETS} from './release-integrity.mjs';
const sha='a'.repeat(40),content=new TextEncoder().encode('safe reviewed release bytes');
test('release manifest records exact SHA and hashes every deployed essential asset',async()=>{
 const out=await buildIntegrityManifest(sha,async()=>content);
 assert.equal(out.gitSha,sha);assert.equal(Object.keys(out.assets).length,7);
 assert.equal(out.assets['/app.js'],createHash('sha256').update(content).digest('hex'));
 await assert.rejects(()=>buildIntegrityManifest('fake'),/Invalid exact/);
});
test('verifier rejects mismatch, missing asset and unexpected content',async()=>{
 const manifest=await buildIntegrityManifest(sha,async()=>content);
 const good={origin:'https://example.workers.dev',manifest,expectedSha:sha,
   fetchImpl:async()=>({ok:true,arrayBuffer:async()=>content})};
 assert.deepEqual(await verifyPublicIntegrity(good),{ok:true,sha,assets:RELEASE_ASSETS.length});
 await assert.rejects(()=>verifyPublicIntegrity({...good,expectedSha:'b'.repeat(40)}),/SHA mismatch/);
 await assert.rejects(()=>verifyPublicIntegrity({...good,fetchImpl:async()=>({
   ok:true,arrayBuffer:async()=>new Uint8Array([2,3,4])})}),/SHA256 mismatch/);
 await assert.rejects(()=>verifyPublicIntegrity({...good,origin:'http://unsafe.local'}),/Invalid HTTPS/);
});

test('production verifier tolerates bounded propagation of the manifest and static assets',async()=>{
 const manifest=await buildIntegrityManifest(sha,async()=>content);
 let attempts=0,waits=0;
 const fetchImpl=async url=>{
  if(url.includes('build-info.json')){
   attempts++;
   return attempts<3?{ok:false,status:404}:{ok:true,json:async()=>manifest};
  }
  return {ok:true,arrayBuffer:async()=>content};
 };
 const result=await verifyProductionEventually({
  origin:'https://example.workers.dev',expectedSha:sha,fetchImpl,
  maxAttempts:4,delayMs:1,sleep:async()=>waits++
 });
 assert.equal(result.ok,true);
 assert.equal(attempts,3);
 assert.equal(waits,2);
 await assert.rejects(()=>verifyProductionEventually({
  origin:'https://example.workers.dev',expectedSha:sha,
  fetchImpl:async()=>({ok:false,status:404}),maxAttempts:2,
  delayMs:1,sleep:async()=>{}
 }),/bounded attempts/);
});
