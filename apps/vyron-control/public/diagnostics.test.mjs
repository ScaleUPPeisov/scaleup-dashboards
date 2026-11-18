import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeConnection,compareShellVersions,inspectPwaVersion,inspectPushSubscription} from './diagnostics.mjs';

test('connection report distinguishes healthy cloud, missing OAuth and offline Mac',()=>{
 const data={channels:Array.from({length:33},(_,i)=>({id:String(i)})),
   analyticsHealth:{linkedProfiles:31},
   devices:[{lastSeenAt:'2026-11-18T10:00:00Z'}],
   production:{items:[{id:'a'}]}};
 const report=summarizeConnection({ok:true,d1:{schema:true}},data,Date.parse('2026-11-18T10:10:00Z'));
 assert.equal(report.channels,33);
 assert.equal(report.oauth,31);
 assert.equal(report.macOnline,false);
 assert.equal(report.jobs,1);
 assert.match(report.message,/Mac offline/);
});
test('offline connectivity cannot be reported as passed',()=>{
 assert.equal(summarizeConnection({ok:false,d1:{schema:false}},{channels:[]}).ok,false);
});
test('PWA version checker compares real network SW against local CacheStorage without clearing login',async()=>{
 let updated=0,remoteCalls=0;
 const result=await inspectPwaVersion({
   serviceWorker:{getRegistration:async()=>({active:{},update:async()=>updated++})},
   cachesApi:{keys:async()=>['vyron-peisov-yt-shell-v9']},
   fetchImpl:async(url,options)=>{
     remoteCalls++;assert.equal(options.cache,'no-store');
     return {ok:true,text:async()=>"const SHELL_CACHE='vyron-peisov-yt-shell-v10';"};
   }
 });
 assert.equal(result.state,'UPDATE_AVAILABLE');
 assert.equal(updated,1);assert.equal(remoteCalls,1);
 const match=compareShellVersions(['vyron-peisov-yt-shell-v10'],
   "const SHELL_CACHE='vyron-peisov-yt-shell-v10';");
 assert.equal(match.current,true);
});
test('push probe never sends notification or requests permission',async()=>{
 const serviceWorker={getRegistration:async()=>({pushManager:{getSubscription:async()=>null}})};
 const noSub=await inspectPushSubscription({serviceWorker,NotificationClass:{permission:'granted'}});
 assert.equal(noSub.ready,false);
 const denied=await inspectPushSubscription({serviceWorker,NotificationClass:{permission:'denied'}});
 assert.equal(denied.ready,false);
 const yes=await inspectPushSubscription({
   serviceWorker:{getRegistration:async()=>({pushManager:{
     getSubscription:async()=>({endpoint:'https://example.com/push'})
   }})},NotificationClass:{permission:'granted'}});
 assert.equal(yes.ready,true);
});
