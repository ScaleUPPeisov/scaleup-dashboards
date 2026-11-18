import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { chromium,webkit } from 'playwright';

const base=resolve(fileURLToPath(new URL('../public/',import.meta.url)));
const shots=resolve(fileURLToPath(new URL('../qa-screenshots/',import.meta.url)));

const mime={'.html':'text/html;charset=utf-8','.css':'text/css;charset=utf-8',
  '.js':'text/javascript;charset=utf-8','.mjs':'text/javascript;charset=utf-8',
  '.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
// Explicitly synthetic browser-only fixtures; never connected to live YouTube.
const qaTime=new Date().toISOString();
const qaDays=Array.from({length:28},(_,i)=>({date:'2026-10-'+String(i+1).padStart(2,'0'),
  views:30+i*4,watchMinutes:100+i*2,subscribersGained:i%3===0?1:0,subscribersLost:0,
  averageViewDuration:180,averageViewPercentage:47.3}));
const qaChannels=Array.from({length:33},(_,i)=>{
  const id='qa-fixture-'+String(i+1).padStart(2,'0');
  return {id,name:'QA Fixture Channel '+String(i+1).padStart(2,'0'),
    subscribers:100+i*15,previousSubscribers:98+i*15,views:2000+i*160,videos:18+i,
    updatedAt:qaTime,subscribersHidden:false,analyticsAuthorized:i<31,
    analytics:i>=31?null:{
      source:'GOOGLE_ANALYTICS_API',updatedAt:qaTime,periodDays:28,
      views:550+i*32,watchMinutes:1400+i*34,
      subscribersGained:12,subscribersLost:2,averageViewDuration:180,
      averageViewPercentage:47.3,daily:qaDays,
      reports:{topVideos:[{videoId:'fixture-video-id',views:350}],
        trafficSources:[{source:'YT_SEARCH',views:160}],
        devices:[{deviceType:'MOBILE',views:320}],
        countries:[{country:'RU',views:200}]}
    }};
});
const qaEvents=[
  {id:'qa-event-1',type:'render_started',title:'QA Fixture • render',name:'QA Fixture render',detectedAt:qaTime},
  {id:'qa-event-2',type:'upload_started',title:'QA Fixture • upload',name:'QA Fixture upload',detectedAt:qaTime}
];
const qaStatus={
  configured:true,syncing:false,lastError:null,lastSuccessAt:qaTime,
  quota:{day:'2026-11-17',spent:100,budget:10000},
  channels:qaChannels,
  totalSubscribers:{value:11700,covered:33,total:33},
  totalViews:{value:156000,covered:33,total:33},
  totalVideos:{value:1100,covered:33,total:33},
  publicTrend:qaDays.slice(-14).map(x=>({date:x.date,views:100000+x.views*33,covered:33,total:33})),
  analyticsSummary:{authorized:31,daily:qaDays,views:31000},
  analyticsHealth:{linkedProfiles:31,reportChannels:31,
    needsAuthorization:['QA Fixture Channel 32','QA Fixture Channel 33'],
    awaitingReports:[],profilesWithErrors:0},
  events:qaEvents,
  devices:[{id:'qa-device',lastSeenAt:qaTime,status:{rendersActive:1,uploadsQueued:2,jobsReadyUpload:3}}],
  commands:[]
};
const server=createServer(async (req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname.startsWith('/api/')){
    const payload=url.pathname==='/api/health'?{ok:true,d1:{schema:true}}:
      url.pathname==='/api/status'?qaStatus:
      url.pathname==='/api/oauth/profiles'?{configured:true,profiles:[]}:
      url.pathname==='/api/push/public-key'?{supported:false}:
      url.pathname==='/api/events'?{events:[],nextCursor:null}:
      {ok:true};
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'})
      .end(JSON.stringify(payload));return;
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
const engine=process.env.NEO_QA_BROWSER==='webkit'?'webkit':'chromium';
const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
await mkdir(shots,{recursive:true});
const widths=[320,375,390,393,402,430];
const screens=['overview','channels','analytics','studio','insights','notifications','channel-detail','system'];
try {
  for(const width of widths.concat([768,1280])){
    // Visual QA isolates viewport/layout from service-worker install/controllerchange
    // reload races. Offline/PWA installation is covered by a separate browser gate.
    const page=await browser.newPage({viewport:{width,height:852},deviceScaleFactor:2,
      serviceWorkers:'block'});
    const errors=[];
    page.on('pageerror',err=>errors.push(err.message));
    await page.addInitScript(()=>{
      sessionStorage.setItem('vyron-control-access','QA_FIXTURE_NOT_A_REAL_CONTROL_TOKEN');
    });
    await page.goto(url,{waitUntil:'networkidle'});
    await page.waitForSelector('#dashboard:not([hidden])');
    await page.evaluate(async ()=>{
      const ng=await import('/neo-glass.mjs');
      const data=await (await fetch('/api/status')).json();
      ng.selectNeoChannel(data.channels[0].id);
      ng.renderNeoGlass(data);
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
        await page.screenshot({path:join(shots,engine+'-'+String(width)+'-'+view+'.png'),fullPage:false});
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
    console.log('PASS '+engine+' '+width+'px / 8 views / overflow / browser errors');
  }
}finally{
  await browser.close();
  server.close();
}
