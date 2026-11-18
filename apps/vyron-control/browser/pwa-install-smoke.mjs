// Chromium + WebKit browser regression using isolated test-only cookies, never owner secrets.
// Real iOS Safari/PWA and Push delivery must still be checked on a physical device.
import {createServer} from 'node:http';
import {randomUUID} from 'node:crypto';
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
const SECRET='Q'.repeat(40),CSRF='e'.repeat(64),sessions=new Set();
const data={configured:false,syncing:false,channels:[],events:[],devices:[],commands:[],
 quota:{day:'2026-11-18',spent:0,budget:10000},
 totalSubscribers:{value:0,covered:0,total:0},
 totalViews:{value:0,covered:0,total:0},totalVideos:{value:0,covered:0,total:0},
 analyticsSummary:{authorized:0,daily:[]},analyticsHealth:{linkedProfiles:0,needsAuthorization:[]}};
let upgrade=false;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)vyron_qa_session=([^;]+)/)?.[1];
 const authenticated=Boolean(token&&sessions.has(token));
 if(url.pathname.startsWith('/api/')){
  const reply=(status,obj,extra={})=>res.writeHead(status,{
   'Content-Type':'application/json','Cache-Control':'no-store',...extra
  }).end(JSON.stringify(obj));
  if(url.pathname==='/api/auth/login'&&req.method==='POST'){
   let body='';
   for await(const chunk of req)body+=chunk;
   const input=JSON.parse(body||'{}');
   if(input.controlToken!==SECRET)return reply(401,{error:'Invalid credentials'});
   const issued=randomUUID();sessions.add(issued);
   // HTTP loopback fixture: production's __Host- cookie is covered by integration tests.
   return reply(200,{authenticated:true,csrfToken:CSRF},{
    'Set-Cookie':'vyron_qa_session='+issued+'; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000'
   });
  }
  if(url.pathname==='/api/auth/session'){
   return authenticated?reply(200,{authenticated:true,csrfToken:CSRF}):
     reply(401,{error:'Unauthorized'});
  }
  if(url.pathname==='/api/health')return reply(200,{ok:true,d1:{schema:true}});
  if(!authenticated)return reply(401,{error:'Unauthorized'});
  if(url.pathname==='/api/status')return reply(200,data);
  if(url.pathname==='/api/oauth/profiles')return reply(200,{configured:false,profiles:[]});
  if(url.pathname==='/api/push/public-key')return reply(200,{supported:false});
  if(url.pathname==='/api/events')return reply(200,{events:[],nextCursor:null});
  if(url.pathname==='/api/auth/logout'){
   if(req.headers['x-vyron-csrf']!==CSRF)return reply(403,{error:'CSRF'});
   sessions.delete(token);
   return reply(200,{loggedOut:true},{'Set-Cookie':'vyron_qa_session=; Path=/; Max-Age=0'});
  }
  return reply(200,{ok:true});
 }
 const file=resolve(root,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!(file===join(root,'index.html')||file.startsWith(root+'/'))){res.writeHead(403).end();return;}
 try{
  let content=await readFile(file);
  if(url.pathname==='/service-worker.js'&&upgrade)
   content=Buffer.from(content.toString('utf8').replaceAll(
     'vyron-peisov-yt-shell-v13','vyron-peisov-yt-shell-v14'));
  res.writeHead(200,{'Content-Type':mime[extname(file)]||'application/octet-stream',
   'Cache-Control':'no-store'}).end(content);
 }catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
try{
 const context=await browser.newContext({viewport:{width:393,height:852},
  deviceScaleFactor:2,serviceWorkers:'allow'});
 let page=await context.newPage();
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#access-token').fill(SECRET);
 await page.locator('#login-form button[type="submit"]').click();
 await page.waitForSelector('#dashboard:not([hidden])',{timeout:15000});
 const cookies=await context.cookies();
 const saved=cookies.find(c=>c.name==='vyron_qa_session');
 assert.ok(saved?.httpOnly,'login must keep cookie HttpOnly');
 assert.ok(saved?.expires>Date.now()/1000,'session cookie must survive browser restart');
 assert.equal(await page.evaluate(()=>sessionStorage.getItem('vyron-control-access')),null);
 assert.equal(await page.evaluate(()=>document.cookie.includes('vyron_qa_session')),false);
 await page.close();
 page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#dashboard:not([hidden])',{timeout:15000});
 assert.equal(await page.locator('#access-token').inputValue(),'',
  'PWA reopen must not need CONTROL_TOKEN again');
 const result=await page.request.get(origin+'/api/status');
 assert.equal(result.status(),200);
 if(engine==='webkit'){
  const manifest=await page.request.get(origin+'/manifest.webmanifest');
  assert.equal((await manifest.json()).name,'VYRON PEISOV YT');
  assert.deepEqual(errors,[]);
  console.log('PASS WebKit browser: one-time login, HttpOnly cookie, close/reopen without secret, no JS exceptions. Native iOS SW/Push UNVERIFIED.');
 }else{
  await page.waitForTimeout(1200);
  const swDebug=await page.evaluate(async()=>{
    const r=await navigator.serviceWorker?.getRegistration();
    return {
      secure:window.isSecureContext,supported:'serviceWorker' in navigator,
      installing:r?.installing?.state||null,waiting:r?.waiting?.state||null,
      active:r?.active?.state||null,scope:r?.scope||null,cacheKeys:await caches.keys()
    };
  });
  console.log('PWA Chromium registration diagnostic:',JSON.stringify(swDebug));
  await page.waitForFunction(async()=>(await caches.keys()).includes('vyron-peisov-yt-shell-v13'),
   null,{timeout:20000});
  await page.waitForFunction(()=>Boolean(navigator.serviceWorker?.controller),
   null,{timeout:20000});
  const cachedApi=await page.evaluate(async()=>Promise.all(
   (await caches.keys()).map(async key=>Boolean(await(await caches.open(key)).match('/api/status')))));
  assert.equal(cachedApi.some(Boolean),false);
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  assert.equal(await page.title(),'VYRON PEISOV YT');
  await context.setOffline(false);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:15000});
  // Corrupted cache: remove the module; boot watchdog must display a recovery view.
  await page.evaluate(async()=>{
   const cache=await caches.open('vyron-peisov-yt-shell-v13');
   await cache.delete('/app.js');
  });
  await context.setOffline(true);
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  // A corrupted JS cache may still have a valid browser module in memory. In
  // that case the app must show its explicit offline/session error, not a blank page.
  await page.waitForFunction(()=>{
    const recovery=document.getElementById('boot-recovery');
    const login=document.getElementById('login');
    const message=document.getElementById('login-error')?.textContent||'';
    return Boolean((recovery&&!recovery.hidden)||
      (login&&!login.hidden&&/ошибк|недоступн|соединени/i.test(message)));
  },null,{timeout:15000});
  await context.setOffline(false);
  await page.reload({waitUntil:'domcontentloaded',timeout:20000});
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:15000});
  assert.ok((await context.cookies()).some(c=>c.name==='vyron_qa_session'));
  upgrade=true;
  await page.evaluate(async()=>{const reg=await navigator.serviceWorker.getRegistration();await reg.update();});
  await page.waitForFunction(async()=>{
   const cache=await caches.open('vyron-peisov-yt-shell-v14');
   return Boolean(await cache.match('/'));
  },null,{timeout:20000});
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForSelector('#dashboard:not([hidden])',{timeout:15000});
  assert.equal(await page.locator('#access-token').inputValue(),'');
  console.log('PASS Chromium PWA: login persists, offline, corrupted cache recovery, atomic SW v13→v14, no private API cache.');
 }
 await context.close();
}finally{await browser.close();server.close();}
