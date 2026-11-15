import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const publicDir=dirname(fileURLToPath(import.meta.url));
const html=await readFile(resolve(publicDir,'index.html'),'utf8');
const css=await readFile(resolve(publicDir,'styles.css'),'utf8');
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
  const targets=[...html.matchAll(/data-mobile-target="([^"]+)"/g)].map(match=>match[1]).sort();
  const views=[...html.matchAll(/data-mobile-view="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(targets,['analytics','channels','events','overview','system']);
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
  assert.ok(serviceWorker.includes("vyron-peisov-yt-shell-v4"));
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
