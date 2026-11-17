import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const shots=resolve(fileURLToPath(new URL('../qa-screenshots/',import.meta.url)));
const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8',
  '.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
  '.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
const server=createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    res.writeHead(401,{'Content-Type':'application/json'}).end('{"error":"QA fixture: no backend"}');
    return;
  }
  const path=resolve(base,'.'+(url.pathname==='/'?'/index.html':url.pathname));
  if(!(path===join(base,'index.html')||path.startsWith(base+'/'))){
    res.writeHead(403).end();return;
  }
  try {
    const contents=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream'}).end(contents);
  }catch{res.writeHead(404).end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const url='http://127.0.0.1:'+server.address().port+'/';
const browser=await chromium.launch({headless:true});
await mkdir(shots,{recursive:true});
const widths=[320,375,390,393,402,430];
const screens=['overview','channels','analytics','studio','insights','notifications','channel-detail','system'];
try {
  for(const width of widths.concat([768,1280])){
    const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2});
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.goto(url,{waitUntil:'networkidle'});
    await page.waitForSelector('#login');
    await page.evaluate(async ()=>{
      document.querySelector('#login').hidden=true;
      document.querySelector('#dashboard').hidden=false;
      document.querySelector('#logout').hidden=true;
      const ng=await import('/neo-glass.mjs');
      const now=new Date().toISOString();
      const fixture={
        channels:[{id:'qa-fixture',name:'QA fixture channel',views:3301,subscribers:216,
          previousSubscribers:212,updatedAt:now,analyticsAuthorized:true,
          analytics:{source:'GOOGLE_ANALYTICS_API',periodDays:28,views:802,watchMinutes:1230,
            subscribersGained:8,subscribersLost:2,averageViewPercentage:47.5,
            avgViewSeconds:188,updatedAt:now,
            daily:Array.from({length:14},(_,i)=>({date:'2026-11-'+String(i+1).padStart(2,'0'),views:12+i*4})),
            reports:{topVideos:[{videoId:'qa-fixture',views:303}],trafficSources:[{source:'YT_SEARCH',views:160}]}}}],
        devices:[{id:'qa-device',lastSeenAt:now,status:{rendersActive:1,uploadsQueued:2,jobsReadyUpload:3}}],
        events:[{type:'render_started',name:'QA screenshot only',title:'Render started',detectedAt:now}],
        analyticsHealth:{linkedProfiles:1},lastError:null
      };
      ng.selectNeoChannel('qa-fixture');
      ng.renderNeoGlass(fixture);
    });
    const desktop=width>760;
    for(const view of screens){
      await page.evaluate(view=>{
        for(const section of document.querySelectorAll('[data-mobile-view]')){
          section.classList.toggle('mobile-view-hidden',section.dataset.mobileView!==view);
        }
        document.querySelectorAll('#main-nav button').forEach(button=>{
          button.classList.toggle('active',button.dataset.mobileTarget===view);
        });
        const dashboard=document.getElementById('dashboard');
        dashboard.scrollTop=0;
      },view);
      await page.waitForTimeout(90);
      const measurements=await page.evaluate(()=>{
        const w=window.innerWidth;
        const overflow=[...document.querySelectorAll('body *')].filter(el=>{
          const cs=getComputedStyle(el),r=el.getBoundingClientRect();
          if(cs.display==='none'||cs.visibility==='hidden'||r.width===0||r.height===0)return false;
          if(el.closest('svg'))return false;
          return r.left < -2||r.right > w+2;
        }).slice(0,6).map(el=>({tag:el.tagName,cls:String(el.className).slice(0,50),
          left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)}));
        return {width:w,scrollWidth:document.documentElement.scrollWidth,overflow};
      });
      assert.ok(measurements.scrollWidth<=measurements.width+1,
        width+'px '+view+' scroll overflow: '+JSON.stringify(measurements));
      if(width<=430)assert.deepEqual(measurements.overflow,[],
        width+'px '+view+' element overflow');
      if(width===393||width===320||width===1280){
        await page.screenshot({path:join(shots,String(width)+'-'+view+'.png'),fullPage:false});
      }
    }
    if(width===393){
      await page.evaluate(()=>{
        document.querySelector('#login').hidden=true;
        document.querySelector('#dashboard').hidden=false;
      });
      const nav=page.locator('#main-nav button[data-mobile-target="studio"]');
      await nav.click();
      await page.waitForTimeout(80);
      assert.equal(await page.locator('[data-mobile-view="studio"]').evaluate(el=>getComputedStyle(el).display!=='none'),true);
      const header=await page.locator('.topbar').boundingBox();
      const dock=await page.locator('#main-nav').boundingBox();
      assert.ok(header&&header.y>=0&&header.y+header.height<=100,'header must remain visible');
      assert.ok(dock&&dock.y>600&&dock.y+dock.height<=852,'dock must respect viewport');
    }
    assert.deepEqual(errors,[],width+'px browser page error(s)');
    await page.close();
    console.log('PASS '+width+'px / 8 views / overflow / browser errors');
  }
}finally{
  await browser.close();
  server.close();
}
