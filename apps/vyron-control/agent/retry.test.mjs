import test from 'node:test';
import assert from 'node:assert/strict';
import {RetryBudget,diagnosticCode} from './retry.mjs';

test('per-operation backoff is exponential, bounded and resets after success',()=>{
 let now=1000;
 const r=new RetryBudget({now:()=>now,random:()=>.5,base:1000,cap:4000});
 assert.equal(r.shouldRun('events'),true);
 assert.equal(r.fail('events',new Error('Network failed')).delay,1000);
 assert.equal(r.shouldRun('events'),false);
 assert.equal(r.shouldRun('heartbeat'),true);
 now=2000;
 assert.equal(r.shouldRun('events'),true);
 assert.equal(r.fail('events',new Error('Network failed')).delay,2000);
 now=4000;
 assert.equal(r.fail('events',new Error('Network failed')).delay,4000);
 now=8000;
 assert.equal(r.fail('events',new Error('Network failed')).delay,4000);
 r.success('events');
 assert.equal(r.remainingMs('events'),0);
 assert.equal(r.fail('events',new Error('Network failed')).delay,1000);
});
test('HTTP auth failures have a long quiet retry and no tokens leak into state',()=>{
 const r=new RetryBudget({now:()=>1000,random:()=>.5,base:1000});
 const state=r.fail('oauth',new Error('Cloud HTTP 401'));
 assert.equal(state.code,'AUTH_DENIED');
 assert.equal(state.delay,300000);
 assert.equal(JSON.stringify(state).includes('Bearer'),false);
});
test('diagnostic classifier does not include raw exception messages',()=>{
 assert.equal(diagnosticCode(new Error('Cloud HTTP 429')),'RATE_LIMIT');
 assert.equal(diagnosticCode(new Error('Cloud HTTP 503')),'CLOUD_UNAVAILABLE');
 assert.equal(diagnosticCode(Object.assign(new Error('secret token'),{name:'AbortError'})),
   'NETWORK_TIMEOUT');
});
