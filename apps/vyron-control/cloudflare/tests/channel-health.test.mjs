import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsSyncStatus} from '../src/channel-health.mjs';
const now=new Date('2026-11-18T10:00:00.000Z');
const row={analytics_authorized:1,analytics_source:'GOOGLE_ANALYTICS_API',
  analytics_captured_at:'2026-11-18T09:00:00.000Z',oauth_last_error:null};
test('four honest channel states distinguish OAuth, data freshness and sync error',()=>{
 assert.equal(analyticsSyncStatus(row,now),'CONNECTED');
 assert.equal(analyticsSyncStatus({...row,analytics_authorized:0},now),'REQUIRES_AUTH');
 assert.equal(analyticsSyncStatus({...row,oauth_last_error:'invalid_grant'},now),'ERROR');
 assert.equal(analyticsSyncStatus({...row,analytics_captured_at:'2026-11-15T09:00:00Z'},now),'STALE');
 assert.equal(analyticsSyncStatus({...row,analytics_captured_at:null},now),'STALE');
 assert.equal(analyticsSyncStatus({...row,oauth_last_error:'Some Analytics breakdowns unavailable: optional device rows'},now),'CONNECTED');
 assert.equal(analyticsSyncStatus({...row,analytics_source:'VYRON_MAC_CACHE'},now),'STALE');
});
