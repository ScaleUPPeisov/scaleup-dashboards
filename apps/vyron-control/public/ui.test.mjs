import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const publicDir=dirname(fileURLToPath(import.meta.url));
const html=await readFile(resolve(publicDir,'index.html'),'utf8');
const css=await readFile(resolve(publicDir,'styles.css'),'utf8');
const neoCss=await readFile(resolve(publicDir,'neo-glass.css'),'utf8');
const neoJs=await readFile(resolve(publicDir,'neo-glass.mjs'),'utf8');
const app=await readFile(resolve(publicDir,'app.js'),'utf8');
const installer=await readFile(resolve(publicDir,'install-mac-agent.sh'),'utf8');
const serviceWorker=await readFile(resolve(publicDir,'service-worker.js'),'utf8');
const manifest=JSON.parse(await readFile(resolve(publicDir,'manifest.webmanifest'),'utf8'));

test('workspace HTML has unique element IDs',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,'duplicate HTML id found');
});

test('every static app.js DOM lookup exists in the HTML',()=>{
  const ids=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]));
  const refs=[...app.matchAll(/\$\('([^']+)'\)/g)].map(match=>match[1]);
  const missing=[...new Set(refs.filter(id=>!ids.has(id)))];
  assert.deepEqual(missing,[]);
});

test('five workspace navigation tabs resolve to real views',()=>{
  const nav=html.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)?.[0]||'';
  const targets=[...nav.matchAll(/data-mobile-target="([^"]+)"/g)].map(match=>match[1]).sort();
  const views=[...html.matchAll(/data-mobile-view="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(targets,['analytics','channels','overview','studio','system']);
  for(const target of targets)assert.ok(views.includes(target),'missing view: '+target);
  assert.ok(html.indexOf('id="main-nav"')<html.indexOf('class="headline"'),
    'desktop workspace navigation must appear before the active view');
  assert.ok(html.includes('id="channel-filter"'),'channel status filter missing');
  assert.match(css,/\.mobile-view-hidden\s*\{\s*display:none!important\s*\}/);
});

test('overview dashboard exposes live sync, Analytics and event containers',()=>{
  for(const id of [
    'network-status','overview-channel-count','overview-analytics-count',
    'overview-mac-state','overview-sync-time','overview-trend','overview-events'
  ])assert.ok(html.includes('id="'+id+'"'),'missing overview element: '+id);
  assert.match(app,/function renderOverview\(data\)/);
  assert.match(app,/function renderOverviewTrend\(rows,source=/);
});

test('Mac system diagnostics expose real telemetry fields',()=>{
  for(const id of [
    'mac-vyron-version','mac-endlume-version','mac-os-version','mac-model',
    'mac-architecture','mac-uptime','mac-memory','mac-root-disk',
    'mac-power-state','mac-disk-state','mac-agent-error'
  ])assert.ok(html.includes('id="'+id+'"'),'missing Mac diagnostic: '+id);
  assert.match(app,/function formatBytes\(value\)/);
  assert.match(app,/s\.memoryFreeBytes/);
  assert.match(app,/s\.rootDiskFreeBytes/);
});

test('PWA caches every imported browser module but never authenticated API responses',()=>{
  assert.ok(serviceWorker.includes("'/app.js'"));
  const importedModules=[...app.matchAll(/from\s+['"]\.\/([^'"]+)['"]/g)]
    .map(match=>match[1]);
  assert.ok(importedModules.length>0,'expected browser modules to be imported');
  for(const modulePath of importedModules)
    assert.ok(serviceWorker.includes("'/"+modulePath+"'"),
      'offline shell is missing imported module: '+modulePath);
  assert.ok(serviceWorker.includes("vyron-peisov-yt-shell-v5"));
  assert.ok(app.includes('async function ensureServiceWorker()'));
  assert.ok(app.includes('void ensureServiceWorker().catch'));
  assert.ok(serviceWorker.includes("url.pathname.startsWith('/api/')"));
  assert.ok(serviceWorker.includes("caches.match('/')"));
});

test('Mac installer and dashboard command use the same source branch',()=>{
  const branch='release/vyron-control-production';
  assert.ok(app.includes('/'+branch+'/apps/vyron-control/public/install-mac-agent.sh'));
  assert.ok(installer.includes("BRANCH='"+branch+"'"));
});


test('VYRON PEISOV YT iPhone 14 Pro 393px viewport respects safe areas',()=>{
  assert.equal(manifest.name,'VYRON PEISOV YT');
  assert.equal(manifest.short_name,'VYRON PEISOV YT');
  assert.match(html,/apple-mobile-web-app-title" content="VYRON PEISOV YT"/);
  assert.match(css,/@media\(min-width:375px\) and \(max-width:430px\)/);
  assert.match(css,/overflow-x:clip/);
  assert.match(css,/safe-area-inset-left/);
  assert.match(css,/safe-area-inset-bottom/);
  for(const id of ['network-attention','network-attention-message','overview-analytics-open',
    'analytics-health-note','push-test'])
    assert.ok(html.includes('id="'+id+'"'),id+' missing');
  assert.match(app,/data.publicTrend/);
  assert.match(app,/channelTotal>0&&row.covered===channelTotal/);
});

test('Neo Glass screens preserve eight connected views and accessible navigation',()=>{
  for(const view of ['overview','channels','analytics','studio','system','notifications','insights','channel-detail'])
    assert.ok(html.includes('data-mobile-view="'+view+'"'),'screen missing: '+view);
  for(const id of ['studio-feed','studio-mac-state','insights-priorities',
    'detail-top-videos','detail-chart','notifications-open','attention-count'])
    assert.ok(html.includes('id="'+id+'"'),'missing connected element: '+id);
  assert.ok(html.includes('href="/neo-glass.css"'));
  assert.ok(app.includes("from './neo-glass.mjs'"));
  assert.match(neoJs,/export function renderNeoGlass\(data\)/);
  assert.match(neoJs,/export function selectNeoChannel\(channelId\)/);
  assert.match(neoJs,/data\.events\|\|\[\]/);
  assert.match(neoJs,/data\.channels\|\|\[\]/);
});
test('Neo Glass shell uses a real central scroll container with safe-area dock',()=>{
  assert.match(neoCss,/#dashboard\s*\{[\s\S]*?overflow-y:auto/);
  assert.match(neoCss,/height:100dvh/);
  assert.match(neoCss,/env\(safe-area-inset-top/);
  assert.match(neoCss,/env\(safe-area-inset-bottom/);
  assert.match(neoCss,/@media\(max-width:359px\)/);
  assert.match(neoCss,/@media\(prefers-reduced-motion:reduce\)/);
  assert.ok(serviceWorker.includes("'/neo-glass.css'"));
  assert.ok(serviceWorker.includes("'/neo-glass.mjs'"));
  assert.ok(!neoJs.includes("fetch('/api/"),'UI must not initiate a second quota-consuming API request');
});
