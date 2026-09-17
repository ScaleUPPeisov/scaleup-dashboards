import React from 'react';
import {describe,expect,it} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {ChannelsOS} from './ChannelsOS';
import {DashboardOS} from './DashboardOS';
import {EMPTY_STATE,useApp} from './store';

function hydrate(channels:any[]=[]){
 useApp.getState().hydrate({...EMPTY_STATE,channels,jobs:[],competitors:[],logs:[],uploadHistory:[],fingerprintCache:{},projectLifecycle:{}} as any);
}

describe('VYRON 2.1.6 UI hotfix',()=>{
 it('normalizes a legacy channel without name so Channels cannot crash on name.slice',()=>{
  hydrate([{id:'legacy-1',slug:'legacy-channel',cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'RU',genre:'Music',country:'RU',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}}]);
  const channel=useApp.getState().channels[0];
  expect(channel.name).toBe('legacy-channel');
  expect(()=>renderToStaticMarkup(<ChannelsOS/>)).not.toThrow();
  expect(renderToStaticMarkup(<ChannelsOS/>)).toContain('legacy-channel');
 });

 it('renders the compact operational dashboard with the six required KPI labels',()=>{
  hydrate([]);
  const html=renderToStaticMarkup(<DashboardOS/>);
  for(const label of ['КАНАЛЫ','ГОТОВО ВИДЕО','В ОЧЕРЕДИ','ЗАГРУЖАЕТСЯ','ЗАПЛАНИРОВАНО','ОШИБКИ'])expect(html).toContain(label);
  expect(html).toContain('PRODUCTION');
  expect(html).toContain('UPLOAD QUEUE');
  expect(html).toContain('ТРЕБУЕТ ВНИМАНИЯ');
  expect(html).not.toContain('Views 28d');
  expect(html).not.toContain('Revenue 28d');
  expect(html).not.toContain('Views trend 7d');
  expect(html).not.toContain('YouTube Autopilot');
 });
});
