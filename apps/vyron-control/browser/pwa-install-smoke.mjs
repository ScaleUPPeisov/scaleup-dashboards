// Real headless browser PWA install / offline / upgrade. No Cloudflare or owner tokens.
// Chromium and WebKit are CI browser engines, NOT a physical iPhone/Safari proof.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
const root=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const engine=process.env.NEO_QA_BROWSER==='webkit'?'webkit':'chromium';
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8',
 '.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
 '.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const data={configured:false,syncing:false,channels:[],events:[],devices:[],commands:[],
 quota:{day:'2026-11-18',spent:0,budget:10000},
 totalSubscribers:{value:0,covered:0,total:0},
 totalViews:{value:0,covered:0,total:0},totalVideos:{value:0,covered:0,total:0},
 analyticsSummary:{authorized:0,daily:[]},analyticsHealth:{linkedProfiles:0,needsAuthorization:[]}};
let upgrade=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 if(url.pathname.startsWith('/api/')){
   const response=url.pathname==='/api/health'?{ok:true,d1:{schema:true}}:
     url.pathname==='/api/status'?data:
     url.pathname==='/api/oauth/profiles'?{configured:false,profiles:[]}:
     url.pathname==='/api/push/public-key'?{supported:false}:
     url.pathname==='/api/events'?{events:[],nextCursor:null}:{ok:true};
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
     .end(JSON.stringify(response));return;
 }
 const path=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!(path===join(root,'index.html')||path.startsWith(root+'/'))){
   res.writeHead(403).end();return;
 }
 try{
   let content=await readFile(path);
   if(url.pathname==='/service-worker.js'&&upgrade)
     content=Buffer.from(content.toString('utf8').replaceAll(
       'vyron-peisov-yt-shell-v11','vyron-peisov-yt-shell-v12'));
   res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream',
     'Cache-Control':'no-store'}).end(content);
 }catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:393,height:852},
   deviceScaleFactor:2,serviceWorkers:'allow'});
 const page=await context.newPage();
 page.on('pageerror',e=>console.error('PWA pageerror:',e.message));
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 // Set the fixture session ONCE, not on every reload, to prove real persistence.
 await page.evaluate(()=>sessionStorage.setItem('vyron-control-access','QA_SYNTHETIC_ONLY'));
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(async()=>{
   const reg=await navigator.serviceWorker?.getRegistration();
   return Boolean(reg?.active);
 },{timeout:20000});
 await page.waitForFunction(async()=>(
   (await caches.keys()).includes('vyron-peisov-yt-shell-v11')
 ),{timeout:20000});
 if(engine==='webkit'){
   // WebKit headless can have a registered active SW without claiming a tab.
   // Verify that offline shell bytes exist; real Home Screen control still
   // requires physical Safari confirmation.
   const ready=await page.evaluate(async()=>{
     const reg=await navigator.serviceWorker.getRegistration();
     return Boolean(reg?.active);
   });
   assert.equal(ready,true,'WebKit must register an active Service Worker');
 }else{
   await page.waitForFunction(()=>Boolean(navigator.serviceWorker?.controller),
     undefined,{timeout:20000});
 }
 const local=await page.evaluate(async()=>({
  cached:await caches.keys(),
  apiCached:await Promise.all((await caches.keys()).map(async key=>
    Boolean(await (await caches.open(key)).match('/api/status')))),
  session:sessionStorage.getItem('vyron-control-access')
 }));
 assert.equal(local.session,'QA_SYNTHETIC_ONLY');
 assert.equal(local.apiCached.some(Boolean),false,'Authenticated API must never reach CacheStorage');
 await context.setOffline(true);
 if(engine==='webkit'){
   // Headless WebKit cancels offline page.reload with a policy-check error.
   // Confirm actual offline CacheStorage shell availability instead; never
   // claim this substitutes for a physical iPhone Home Screen navigation test.
   const stored=await page.evaluate(async()=>{
     const response=await caches.match('/');
     return Boolean(response?.ok&&(await response.text()).includes('VYRON PEISOV YT'));
   });
   assert.equal(stored,true,'WebKit must have a valid offline HTML shell');
 }else{
   await page.reload({waitUntil:'domcontentloaded',timeout:20000});
   assert.equal(await page.locator('title').textContent(),'VYRON PEISOV YT');
 }
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vyron-control-access')),
   'QA_SYNTHETIC_ONLY','PWA offline should not clear session');
 await context.setOffline(false);
 upgrade=true;
 await page.evaluate(()=>{
   void navigator.serviceWorker.getRegistration().then(reg=>reg.update());
 });
 // Sequential, bounded handshakes prevent concurrent requestAnimationFrame
 // polling from mixing retiring and newly active Service Worker responses.
 const upgraded=await page.evaluate(async()=>{
   const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
   const probe=async()=>{
     const reg=await navigator.serviceWorker.getRegistration();
     if(!reg?.active)return {name:null,complete:false};
     return new Promise(resolve=>{
       const channel=new MessageChannel();
       const timeout=setTimeout(()=>resolve({name:'timeout',complete:false}),800);
       channel.port1.onmessage=e=>{
         clearTimeout(timeout);
         resolve({name:e.data?.cacheName,complete:e.data?.complete===true});
       };
       reg.active.postMessage({type:'VYRON_PWA_VERSION_PROBE'},[channel.port2]);
     });
   };
   let last={name:'not_started',complete:false};
   for(let attempt=0;attempt<50;attempt++){
     last=await probe();
     if(last.name==='vyron-peisov-yt-shell-v12'&&last.complete){
       await delay(150);
       const again=await probe();
       if(again.name==='vyron-peisov-yt-shell-v12'&&again.complete)
         return {ok:true,cacheName:again.name};
       last=again;
     }
     await delay(200);
   }
   return {ok:false,last};
 });
 assert.deepEqual(upgraded,{ok:true,cacheName:'vyron-peisov-yt-shell-v12'},
   'new Service Worker must be stably active');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vyron-control-access')),
   'QA_SYNTHETIC_ONLY','PWA update must not clear auth session');
 // Another request from the retiring worker may transiently recreate the old
 // public shell cache after activate. Its presence is not an active-version signal.
 // Service Worker activation and new cache are the actual update gate.
 console.log('PASS '+engine+' PWA: install, '+(engine==='webkit'?'offline cache readiness':'offline navigation')+', no cached API, session preservation, SW v11→v12 upgrade.');
 await context.close();
}finally{await browser.close();server.close();}
