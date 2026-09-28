import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Channel,VideoJob,YoutubeExistingVideo} from './types';
import {deriveRunwayRecord} from './channelRunwayCore';
import {buildContentRunway} from './contentRunway';
import {cadenceTruth} from './ChannelRunway';

const channel:Channel={
  id:'clover',name:'Clover Gramophone',slug:'clover-gramophone',cadenceDays:1,publishIntervalDays:1,targetBufferDays:60,
  publishHour:18,publishMinute:0,language:'EN',genre:'Jazz',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
  seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
};
const yt=(i:number):YoutubeExistingVideo=>({
  id:'yt'+i,position:i,title:'YT '+i,description:'',tags:[],categoryId:'10',
  privacyStatus:'private',publishAt:new Date(Date.parse('2026-09-29T11:00:00Z')+(i-1)*86400000).toISOString(),selected:false
});
const local=(i:number):VideoJob=>({
  id:'local'+i,channelId:'clover',number:i,folder:'/Projects/'+i,status:'READY_UPLOAD',createdAt:'2026-09-28T00:00:00Z',
  tracksCount:10,minTracks:10,finalPath:'/Render/Clover Gramophone/'+String(i).padStart(3,'0')+'.mov',
  title:'LOCAL '+i,description:'',tags:[],storageLifecycle:'NEW'
});

describe('VYRON 4.0 YouTube schedule vs local inventory separation',()=>{
  it('Clover: +30 local files never become +30 YouTube scheduled videos',()=>{
    const now=new Date('2026-09-28T08:00:00Z');
    const record=deriveRunwayRecord(channel,Array.from({length:7},(_,i)=>yt(i+1)),now,'2026-09-28T08:00:00Z',true);
    const content=buildContentRunway(channel,record,Array.from({length:30},(_,i)=>local(i+1)),[],{}, {},now);
    expect(record.scheduledVideoCount).toBe(7);
    expect(content.scheduledVideoCount).toBe(7);
    expect(content.readyVideoCount).toBe(30);
    expect(content.projectedReadySlots).toHaveLength(30)
  });

  it('daily factual scheduled slots are labelled Каждый день',()=>{
    const now=new Date('2026-09-28T08:00:00Z');
    const record=deriveRunwayRecord(channel,Array.from({length:7},(_,i)=>yt(i+1)),now,undefined,true);
    expect(record.averagePublishIntervalDays).toBe(1);
    expect(cadenceTruth(channel,record)).toEqual({label:'Каждый день',source:'реальные YouTube scheduled slots'})
  });

  it('main runway UI never presents projected local runway end as YouTube scheduled-through date',()=>{
    const source=fs.readFileSync('src/ChannelRunway.tsx','utf8');
    expect(source).toContain('YouTube scheduled до');
    expect(source).toContain('только real private + future publishAt');
    expect(source).toContain('Local ready');
    expect(source).toContain('НЕ scheduled');
    expect(source).not.toContain('content.projectedRunwayEnd')
  });
});
