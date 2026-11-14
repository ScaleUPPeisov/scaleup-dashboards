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
  assert.match(app,/function renderOverviewTrend\(rows\)/);
});

test('PWA caches every imported browser module but never authenticated API responses',()=>{
  assert.ok(serviceWorker.includes("'/app.js'"));
  const importedModules=[...app.matchAll(/from\\s+['"]\\.\\/([^'"]+)['"]/g)]
    .map(match=>match[1]);
  assert.ok(importedModules.length>0,'expected browser modules to be imported');
  for(const modulePath of importedModules)
    assert.ok(serviceWorker.includes("'/"+modulePath+"'"),
      'offline shell is missing imported module: '+modulePath);
  assert.ok(serviceWorker.includes("vyron-control-shell-v3"));
  assert.ok(serviceWorker.includes("url.pathname.startsWith('/api/')"));
  assert.ok(serviceWorker.includes("caches.match('/')"));
});

test('Mac installer and dashboard command use the same source branch',()=>{
  const branch='feature/vyron-control-mobile-analytics-20261114';
  assert.ok(app.includes('/'+branch+'/apps/vyron-control/public/install-mac-agent.sh'));
  assert.ok(installer.includes("BRANCH='"+branch+"'"));
});
