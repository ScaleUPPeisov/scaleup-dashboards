import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {buildJobSummary,replaceJobsInSummary} from './jobSummary';
import {buildJobRuntimeIndex,patchJobRuntimeIndex} from './jobRuntimeIndex';
import {computeVirtualRange} from './MeasuredVirtualList';
import type {VideoJob} from './types';

function job(i:number):VideoJob{
  const statuses:VideoJob['status'][]=['NEED_IMAGE','WAITING_MUSIC','READY_RENDER','RENDERING','READY_UPLOAD','UPLOADING','SCHEDULED','ERROR'];
  const status=statuses[i%statuses.length];
  return {
    id:'job-'+i,channelId:'channel-'+(i%50),number:i+1,folder:'/Projects/'+i,status,
    createdAt:'2026-09-30T00:00:00Z',tracksCount:i%11,minTracks:10,title:'Job '+i,description:'',tags:[],
    error:status==='ERROR'?'fixture error':undefined
  };
}

describe('VYRON 6.0.1 real zero-jank contracts',()=>{
  it('5000 jobs keep the virtual mounted window below 50 rows',()=>{
    const count=5000,row=112;
    const offsets=Array.from({length:count+1},(_,i)=>i*row);
    for(const scrollTop of [0,800,50_000,200_000,offsets[count]-720]){
      const range=computeVirtualRange(offsets,count,Math.max(0,scrollTop),720,8);
      expect(range.end-range.start).toBeLessThan(50);
    }
  });

  it('5000-job summary/index are one bounded build and preserve selectors on unrelated patches',()=>{
    const jobs=Array.from({length:5000},(_,i)=>job(i));
    const t=performance.now();
    const summary=buildJobSummary(jobs,1),index=buildJobRuntimeIndex(jobs);
    expect(performance.now()-t).toBeLessThan(1500);
    expect(summary.total).toBe(5000);
    expect(index.orderedIds).toHaveLength(5000);

    const replacements=jobs.slice(0,100).map(before=>({before,after:{...before,tracksCount:before.tracksCount+1}}));
    const nextSummary=replaceJobsInSummary(summary,replacements);
    const nextIndex=patchJobRuntimeIndex(index,replacements,jobs.map((j,i)=>i<100?replacements[i].after:j));
    expect(nextSummary).toBe(summary);
    expect(nextIndex.orderedIds).toBe(index.orderedIds);
    expect(nextIndex.idsByChannel).toBe(index.idsByChannel);
    expect(nextIndex.idsByStatus).toBe(index.idsByStatus);
  });

  it('Materials, Topbar and inactive Production parent stay detached from full jobs subscriptions',()=>{
    const materials=readFileSync('src/MaterialsManager.tsx','utf8');
    const production=readFileSync('src/ProductionOS.tsx','utf8');
    const app=readFileSync('src/App.tsx','utf8');
    const topbar=app.slice(app.indexOf('function Topbar(){'),app.indexOf('function PageHeader',app.indexOf('function Topbar(){')));
    expect(materials).not.toContain("useApp(s=>s.jobs)");
    expect(materials).not.toContain('jobs.length');
    expect(production).not.toContain("useApp(s=>s.jobs)");
    expect(topbar).not.toContain("useApp(s=>s.jobs)");
    expect(topbar).toContain('jobSummary.activeErrors');
  });

  it('Production queue uses measured virtualization instead of rendering every row',()=>{
    const queue=readFileSync('src/ProductionQueueDetails.tsx','utf8');
    const virtualizer=readFileSync('src/MeasuredVirtualList.tsx','utf8');
    expect(queue).toContain('<MeasuredVirtualList');
    expect(queue).not.toMatch(/visibleJobIds\.map\(/);
    expect(virtualizer).toContain('ResizeObserver');
    expect(virtualizer).toContain('data-mounted-rows');
  });

  it('always-visible shell cannot restore legacy 80/96px blur',()=>{
    const v070=readFileSync('src/v070.css','utf8');
    const finalCss=readFileSync('src/v601-performance.css','utf8');
    expect(v070).not.toMatch(/\.bgGlow\s*\{[^}]*filter\s*:\s*blur\((80|96)px\)/s);
    expect(finalCss).toMatch(/\.bgGlow\s*\{[^}]*filter\s*:\s*none/s);
    expect(finalCss).toMatch(/\.sidebar,\s*\.topbar\s*\{[^}]*backdrop-filter\s*:\s*none/s);
    expect(finalCss).toContain('90ms');
  });

  it('Autopilot is snapshot-based and commits accumulated channel patches once',()=>{
    const source=readFileSync('src/autopilotRuntime.ts','utf8');
    expect(source).toContain('type ChannelAutomationSnapshot');
    expect(source).toContain('CHANNEL_CONCURRENCY=3');
    expect(source).not.toContain('useApp.getState().jobs.filter');
    expect(source.match(/patchJobsBatch\(patches\)/g)?.length).toBe(1);
  });

  it('autosave is dirty-domain based while full checkpoint remains compatible',()=>{
    const store=readFileSync('src/store.ts','utf8');
    const rust=readFileSync('src-tauri/src/storage.rs','utf8');
    expect(store).toContain("scheduleSave('jobs')");
    expect(store).toContain('saveStateDomains(payload)');
    expect(store).toContain('api.saveState(persistedSnapshot');
    expect(rust).toContain('save_state_domains');
    expect(rust).toContain('incoming.contains_key("settings")');
  });
});
