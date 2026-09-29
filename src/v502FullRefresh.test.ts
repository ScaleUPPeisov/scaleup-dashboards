import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeExistingVideo} from './types';
import {buildContentRunway,confirmedScheduledRunwaySnapshot} from './contentRunway';
import {deriveRunwayRecord} from './channelRunwayCore';

const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
const pipeline=fs.readFileSync('src/fullChannelRefresh.ts','utf8');
const owner=fs.readFileSync('src/youtubeOwnerInventory.ts','utf8');
const runwayUi=fs.readFileSync('src/ChannelRunway.tsx','utf8');

const channel:Channel={
  id:'c1',name:'Aegean Afterglow',slug:'aegean-afterglow',cadenceDays:1,publishIntervalDays:1,
  targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',
  minTracks:10,targetDurationMin:120,enabled:true,
  seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
};
const futureDates=['2026-09-30','2026-10-01','2026-10-02','2026-10-03','2026-10-04','2026-10-05','2026-10-06','2026-10-07','2026-10-08'];
const video=(n:number):YoutubeExistingVideo=>({
  id:'yt-'+n,position:n,title:'v'+n,description:'',tags:[],categoryId:'10',privacyStatus:'private',
  publishAt:`${futureDates[n-1]}T18:00:00+07:00`,selected:false
});

describe('VYRON 5.0.2 full refresh hotfix',()=>{
  it('refresh-all uses one pipeline for stats, owner schedule and zero-quota local render scan',()=>{
    expect(dashboard).toContain('refreshAllChannelData(plan.channelIds)');
    expect(pipeline).toContain("scanAllInventories('manual-all')");
    expect(pipeline).toContain('refreshYoutubeChannelStatisticsSelection(channelIds,true)');
    expect(pipeline).toContain('refreshStaleOwnerInventories(enabled,true)');
    expect(pipeline).toContain('Local Render scan is independent of YouTube');
    expect(pipeline).not.toContain('window.location.reload');
  });

  it('complete owner sync immediately updates the runway store instead of leaving stale plan data',()=>{
    expect(owner).toContain('upsertChannelRunwayFromYoutube(channel,result.videos||[],new Date())');
  });

  it('Plan READY is sourced from live Render inventory',()=>{
    expect(runwayUi).toContain('useLiveInventory');
    expect(runwayUi).toContain('liveSnapshots[channel.id]?.readyVideos');
    expect(runwayUi).toContain('confirmedScheduledRunwaySnapshot');
  });

  it('keeps 9 scheduled and 30 local ready separate',()=>{
    const now=new Date('2026-09-29T00:00:00+07:00');
    const videos=Array.from({length:9},(_,i)=>video(i+1));
    const record=deriveRunwayRecord(channel,videos,now,now.toISOString(),true);
    const base=buildContentRunway(channel,record,[],[],{}, {},now);
    const view=confirmedScheduledRunwaySnapshot(channel,base,record,30);
    expect(view.scheduledVideoCount).toBe(9);
    expect(view.readyVideoCount).toBe(30);
    expect(view.contentRunwayDays).toBe(9);
    expect(view.scheduledRunwayDays).toBe(9);
    expect(view.projectedReadySlots).toEqual([]);
    expect(view.projectedRunwayEnd).toBe(record.scheduledUntil);
  });

  it('does not add updater, OAuth reset or credential mutation to the hotfix pipeline',()=>{
    for(const forbidden of [
      'plugin-updater',
      'youtubeOauthConnect',
      'youtubeOauthDisconnect',
      'keychain',
      'clientSecret',
      'refreshToken',
      'removeChannel',
      'localStorage.clear',
      'credentials.json'
    ]){
      expect(pipeline.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
