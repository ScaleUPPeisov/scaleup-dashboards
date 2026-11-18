import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {buildIntegrityManifest,verifyPublicIntegrity,RELEASE_ASSETS} from './release-integrity.mjs';
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
