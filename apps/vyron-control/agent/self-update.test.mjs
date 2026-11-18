import test from 'node:test';
import assert from 'node:assert/strict';
import {safeAgentDiff,verifiedReleaseChecks} from './self-update.mjs';
const sha='a'.repeat(40);
test('agent only auto-updates reviewed VYRON CONTROL release paths',()=>{
 assert.equal(safeAgentDiff(['apps/vyron-control/agent/bridge.mjs',
   'apps/vyron-control/cloudflare/src/index.mjs',
   '.github/workflows/vyron-control-isolated.yml']),true);
 for(const path of ['src-tauri/src/updater.rs','src/App.tsx',
   'apps/vyron-control/../../src-tauri/x','/tmp/malicious'])
   assert.equal(safeAgentDiff([path]),false);
});
test('auto-update requires exact SHA and both passing GitHub CI checks',()=>{
 const valid=[
  {name:'VYRON CONTROL isolated tests',head_sha:sha,status:'completed',conclusion:'success'},
  {name:'VYRON Privacy Gate',head_sha:sha,status:'completed',conclusion:'success'}
 ];
 assert.equal(verifiedReleaseChecks({check_runs:valid},sha),true);
 assert.equal(verifiedReleaseChecks({check_runs:valid.slice(0,1)},sha),false);
 assert.equal(verifiedReleaseChecks({check_runs:valid},'b'.repeat(40)),false);
 assert.equal(verifiedReleaseChecks({check_runs:[valid[0],{...valid[1],conclusion:'failure'}]},sha),false);
});
