import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAgentDiff,verifiedReleaseChecks,verifiedSignedReleaseCommit} from './self-update.mjs';
const sha='a'.repeat(40);
test('agent only auto-updates reviewed VYRON CONTROL release paths',()=>{
 assert.equal(safeAgentDiff(['apps/vyron-control/agent/bridge.mjs',
   'apps/vyron-control/cloudflare/src/index.mjs',
   '.github/workflows/vyron-control-isolated.yml']),true);
 for(const path of ['src-tauri/src/updater.rs','src/App.tsx',
   'apps/vyron-control/../../src-tauri/x','/tmp/malicious'])
   assert.equal(safeAgentDiff([path]),false);
});
test('auto-update requires signed SHA and successful release-branch CI',()=>{
 const check=(name,head_sha=sha,conclusion='success',head_branch='release/vyron-control-production')=>
  ({name,head_sha,status:'completed',conclusion,event:'push',head_branch});
 const good={workflow_runs:[check('VYRON CONTROL isolated tests'),check('VYRON Privacy Gate'),check('VYRON CONTROL Security Gate')]};
 assert.equal(verifiedReleaseChecks(good,sha),true);
 assert.equal(verifiedReleaseChecks({workflow_runs:[check('VYRON CONTROL isolated tests')]},sha),false);
 assert.equal(verifiedReleaseChecks({workflow_runs:[check('VYRON CONTROL isolated tests'),check('VYRON Privacy Gate')]},sha),false);
 assert.equal(verifiedReleaseChecks({workflow_runs:[check('VYRON CONTROL isolated tests'),check('VYRON Privacy Gate',sha,'success','feature/unreviewed')]},sha),false);
 assert.equal(verifiedReleaseChecks({workflow_runs:[check('VYRON CONTROL isolated tests'),check('VYRON Privacy Gate','b'.repeat(40))]},sha),false);
 assert.equal(verifiedSignedReleaseCommit({
  sha,commit:{verification:{verified:true,reason:'valid'}}
 },sha),true);
 for(const reason of ['unsigned','unknown_key','bad_email']){
  assert.equal(verifiedSignedReleaseCommit({
   sha,commit:{verification:{verified:false,reason}}
  },sha),false);
 }
 assert.equal(verifiedSignedReleaseCommit({
  sha:'b'.repeat(40),commit:{verification:{verified:true,reason:'valid'}}
 },sha),false);
});

// Regression: the released agent must not cap Git history to 64 commits.
// An installed Mac can legitimately be over 170 reviewed commits behind.
test('Mac updater fetches full ancestry, then applies its signed release checks',async()=>{
 const {readFile}=await import('node:fs/promises');
 const {fileURLToPath}=await import('node:url');
 const source=await readFile(fileURLToPath(new URL('./self-update.mjs',import.meta.url)),'utf8');
 assert.ok(source.includes("cmd('git',['fetch','--no-tags','origin','refs/heads/'+BRANCH])"));
 assert.equal(source.includes("'--depth=64'"),false);
 assert.ok(source.includes("verifiedSignedReleaseCommit(await signedResponse.json(),next)"));
 assert.ok(source.includes("verifiedReleaseChecks(await verifiedResponse.json(),next)"));
});
