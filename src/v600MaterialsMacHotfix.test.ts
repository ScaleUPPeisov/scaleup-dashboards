import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const ui=fs.readFileSync('src/MaterialsManager.tsx','utf8');

describe('VYRON 6.0.0 macOS Materials freeze hotfix',()=>{
  it('keeps a hot in-memory snapshot across Materials remounts',()=>{
    expect(ui).toContain('const materialsCache=new Map<string,MaterialsCacheSnapshot>()');
    expect(ui).toContain('if(hot&&hot.jobRevision===jobRevision)return hot');
    expect(ui).not.toContain('useEffect(()=>{void refresh()}');
  });

  it('deduplicates cold refresh and limits filesystem IPC concurrency',()=>{
    expect(ui).toContain('const materialsInFlight=new Map<string,Promise<MaterialsCacheSnapshot>>()');
    expect(ui).toContain('const MATERIALS_SCAN_CONCURRENCY=4');
    expect(ui).toContain('mapLimited(channels,MATERIALS_SCAN_CONCURRENCY');
    expect(ui).not.toContain('for(const ch of channels){');
  });

  it('uses targeted invalidation after per-channel material mutations',()=>{
    expect(ui).toContain('async function refreshChannel(channelId:string)');
    expect(ui).toContain('await refreshChannel(channel.id)');
    expect(ui).toContain('await refreshChannel(channelId)');
    expect(ui).toContain('await refreshChannel(manualChannel.id)');
  });

  it('keeps full rescan explicit for refresh/global cleanup only',()=>{
    expect(ui).toContain('onClick={()=>void refresh(true)}>↻ ОБНОВИТЬ');
    expect(ui).toContain('await refresh(true)');
  });

  it('pre-aggregates job counters instead of filtering all jobs twice per channel row',()=>{
    expect(ui).toContain('const jobCounts=useMemo');
    expect(ui).toContain("if(job.status==='NEED_IMAGE')row.waiting++");
    expect(ui).toContain("if(job.status==='READY_RENDER')row.ready++");
    expect(ui).not.toContain("jobs.filter(j=>j.channelId===ch.id&&j.status==='NEED_IMAGE')");
    expect(ui).not.toContain("jobs.filter(j=>j.channelId===ch.id&&j.status==='READY_RENDER')");
  });

  it('does not touch auth, migration or Windows codepaths',()=>{
    expect(ui).not.toContain('oauth');
    expect(ui).not.toContain('Keychain');
    expect(ui).not.toContain('credentials');
    expect(ui).not.toContain('windows');
  });
});
