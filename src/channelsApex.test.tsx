import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {Channel} from './types';

const fixture=vi.hoisted(()=>({state:{} as Record<string,unknown>,owner:{available:false,complete:false} as Record<string,unknown>}));
vi.mock('./store',()=>({useApp:(select:(state:Record<string,unknown>)=>unknown)=>select(fixture.state)}));
vi.mock('./BatchControl',()=>({BatchControl:()=>null}));
vi.mock('./ChannelPassport',()=>({ChannelPassport:()=>null}));
vi.mock('./renderInventoryRuntime',()=>({useLiveInventory:(select:(state:unknown)=>unknown)=>select({snapshots:{}})}));
vi.mock('./youtubeOwnerInventory',()=>({OWNER_INVENTORY_EVENT:'fixture-owner',ownerInventoryForChannel:()=>fixture.owner}));
vi.mock('./youtubePublishSafety',()=>({safeDailyStatus:()=>({configured:false,unlimited:false})}));
import {ChannelsOS} from './ChannelsOS';

const channel={id:'test-channel',name:'Тестовый канал',slug:'test',enabled:true,cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'RU',genre:'Music',country:'RU',minTracks:10,targetDurationMin:120,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}} as Channel;

describe('APEX channels workspace',()=>{
 beforeEach(()=>{fixture.owner={available:false,complete:false};fixture.state={channels:[channel],jobs:[],addChannel:vi.fn(),updateChannel:vi.fn(),removeChannel:vi.fn(),setPage:vi.fn(),toast:vi.fn()}});
 it('keeps channel metrics and all actions available in compact disclosure sections',()=>{
  const html=renderToStaticMarkup(<ChannelsOS/>);
  const card=html.slice(html.indexOf('aria-labelledby="channel-title-test-channel"'));
  expect(card).toContain('<h2 id="channel-title-test-channel">Тестовый канал</h2>');
  for(const label of ['Подписчики','Всего просмотров','Запланировано на YouTube','Запас по задачам','Видео владельца','Открытые','Закрытые','План VYRON','Следующая YouTube публикация','Последнее обновление'])expect(card).toContain(label);
  expect(card).toContain('<details class="fleetMetricDetails">');
  expect(card).toContain('<details class="fleetMore">');
  for(const label of ['Паспорт','Публикация','Настроить','Аналитика','Расписание','Папки'])expect(card).toContain(label);
  expect(card).toContain('aria-expanded="false"');
 });
 it('defaults to the reference table and renders only one channel inspector',()=>{
  fixture.state.channels=[channel,{...channel,id:'second-channel',name:'Второй канал'}];
  const html=renderToStaticMarkup(<ChannelsOS/>);
  expect(html).toContain('class="apexFleetSplit"');
  expect(html).toContain('aria-label="Выбрать канал: Второй канал"');
  expect(html).toContain('aria-labelledby="channel-title-test-channel"');
  expect(html).not.toContain('aria-labelledby="channel-title-second-channel"');
  expect(html).toContain('Нет данных');
 });
 it('distinguishes unknown YouTube totals from a confirmed zero',()=>{
  const html=renderToStaticMarkup(<ChannelsOS/>);
  expect(html).toContain('<small>Видео владельца</small><b>—</b>');
  expect(html).toContain('<small>Запланировано на YouTube</small><b>—</b>');
  fixture.owner={available:true,complete:true,total:0,public:0,private:0,scheduled:0};
  const confirmed=renderToStaticMarkup(<ChannelsOS/>);
  expect(confirmed).toContain('<small>Видео владельца</small><b>0</b>');
  expect(confirmed).toContain('<small>Запланировано на YouTube</small><b>0</b>');
 });
});
