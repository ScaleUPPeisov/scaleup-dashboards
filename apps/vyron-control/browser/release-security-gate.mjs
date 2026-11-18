// Release guard is static and fail-closed; this workflow never deploys or touches production.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=relative=>readFile(new URL('../'+relative,import.meta.url),'utf8');
const migrations=['0008_production_snapshot.sql','0009_notification_center.sql',
  '0010_channel_presence.sql','0011_youtube_schedule.sql'];
let count=0;
for(const name of migrations){
 const sql=await read('cloudflare/migrations/'+name);
 const stripped=sql.replace(/--[^\n]*/g,'').replace(/\/\*[\s\S]*?\*\//g,'');
 assert.doesNotMatch(stripped,/\b(?:DROP|TRUNCATE|DELETE|REPLACE|ALTER|VACUUM|ATTACH|DETACH)\b/i,
   'New D1 migration must not destructively touch existing data: '+name);
 assert.ok([...stripped.matchAll(/\bCREATE\s+(?:TABLE|INDEX)\s+IF\s+NOT\s+EXISTS\b/gi)].length>0,
   'All new schema objects must be guarded: '+name);
 count++;
}
const worker=await read('cloudflare/src/index.mjs');
const bridge=await read('agent/logic.mjs');
const sw=await read('public/service-worker.js');
const pwa=await read('public/app.js');
const push=await read('public/diagnostics.mjs');
const release=await read('../../.github/workflows/vyron-control-cloudflare-release.yml');
assert.match(worker,/authenticate\(request,env,agentRoute\?'agent':'control'\)/);
assert.match(worker,/return errorReply\('Unauthorized',401\)/);
assert.match(bridge,/if \(command\?\.kind !== 'request_status'\) return \{ supported:false \}/);
assert.match(sw,/url\.pathname\.startsWith\('\/api\/'\)/);
assert.doesNotMatch(sw,/\b(?:Authorization|refresh_token|CONTROL_TOKEN|accessToken)\b/);
// Hotfix must remove browser-held CONTROL_TOKEN, not preserve the old vulnerability.
assert.doesNotMatch(pwa,/sessionStorage\\.(?:getItem|setItem)\\('vyron-control-access'/);
assert.doesNotMatch(pwa,/Authorization:\\s*'Bearer '\\s*\\+\\s*accessToken/);
assert.match(pwa,/\\/api\\/auth\\/session/);
assert.match(pwa,/X-VYRON-CSRF/);
assert.match(push,/Owner-initiated diagnostics/);
assert.doesNotMatch(push,/api\/push\/test/);
assert.match(release,/neo_merged=.*gh api/);
assert.match(release,/confirm_production=true/);
assert.match(release,/Capture production D1 Time Travel rollback bookmark/);
assert.match(release,/Verify D1 application row counts survived migrations/);
assert.match(release,/health\.d1\?\.expectedTables !== 23/);
console.log('PASS Security Gate: '+count+' strictly additive migrations; private API auth;');
console.log('safe read-only agent commands; Service Worker no API caching or secrets;');
console.log('manual-only Push probe; confirmed merge/backup/row count/release gates.');

const trusted=await read('cloudflare/src/device-sessions.mjs');
assert.match(trusted,/HttpOnly; Secure; SameSite=Strict/);
assert.match(trusted,/crypto\.getRandomValues/);
assert.doesNotMatch(trusted,/localStorage|sessionStorage|IndexedDB/);
const extraMigration=await read('cloudflare/migrations/0013_device_sessions.sql');
assert.match(extraMigration,/CREATE TABLE IF NOT EXISTS device_sessions/);
assert.doesNotMatch(extraMigration,/DROP|TRUNCATE|DELETE|REPLACE/i);
