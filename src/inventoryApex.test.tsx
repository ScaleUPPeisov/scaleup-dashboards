import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';

const fixture=vi.hoisted(()=>({app:{} as Record<string,unknown>,inventory:{} as Record<string,unknown>}));
vi.mock('./store',()=>({useApp:(select:(state:Record<string,unknown>)=>unknown)=>select(fixture.app)}));
vi.mock('./renderInventoryRuntime',()=>({
 useLiveInventory:(select:(state:Record<string,unknown>)=>unknown)=>select(fixture.inventory),
 inventoryTotals:(snapshots:Record<string,any>,channels:unknown[])=>({ready:Object.values(snapshots).reduce((n,x)=>n+x.readyVideos,0),uploading:0,channels:channels.length,normal:0,soon:0,low:0,empty:1,offline:1}),
 scanAllInventories:vi.fn(),scanInventoryChannel:vi.fn()
}));
vi.mock('./DailyOperationsCenter',()=>({DailyOperationsCenter:()=>null}));
vi.mock('./api',()=>({api:{}}));
vi.mock('./notificationCenter',()=>({notifySuccess:vi.fn(),notifyWarning:vi.fn()}));
vi.mock('./publishWorkspaceState',()=>({saveActivePublishChannel:vi.fn()}));
import {LiveContentInventory} from './LiveContentInventory';

const base={renderFolderPath:'/fixture/render',stale:false,physicalFiles:0,readyVideos:0,uploadingVideos:0,uploadedLocalCopies:0,newCandidates:0,newGenerations:0,knownReady:0,verifyRequired:0,invalid:0,runwayDays:0};
describe('APEX inventory workspace',()=>{
 beforeEach(()=>{
  fixture.app={channels:[{id:'fresh',name:'Актуальный',enabled:true},{id:'offline',name:'Недоступный',enabled:true},{id:'unknown',name:'Без данных',enabled:true}],settings:{},setPage:vi.fn(),updateChannel:vi.fn(),patchSettings:vi.fn()};
  fixture.inventory={snapshots:{fresh:{...base,channelId:'fresh',channelName:'Актуальный',folderState:'ONLINE',level:'EMPTY',lastScanAt:'2026-01-01T00:00:00Z'},offline:{...base,channelId:'offline',channelName:'Недоступный',folderState:'OFFLINE',level:'OFFLINE',stale:true,readyVideos:4,runwayDays:4,lastConfirmedAt:'2026-01-01T00:00:00Z'}},audit:[],globalScanning:false};
 });
 it('distinguishes confirmed zero, last known offline stock and unknown stock',()=>{
  const html=renderToStaticMarkup(<LiveContentInventory/>);
  const row=(name:string)=>html.slice(html.indexOf(`aria-label="${name}"`)).split('</article>')[0];
  expect(row('Актуальный')).toContain('<dt>Готово</dt><dd>0</dd>');
  expect(row('Актуальный')).toContain('Пусто');
  expect(row('Недоступный')).toContain('<dt>Готово</dt><dd>4</dd>');
  expect(row('Недоступный')).toContain('Папка недоступна · данные устарели');
  expect(row('Недоступный')).toContain('Последний подтверждённый запас');
  expect(row('Без данных')).toContain('<dt>Готово</dt><dd>—</dd>');
  expect(row('Без данных')).toContain('Нет данных');
  expect(html).toContain('Устаревшие данные: 1');
  expect(html).toContain('Нет подтверждённых данных: 1');
 });
 it('keeps channel, folder, rescan and classification controls available',()=>{
  const html=renderToStaticMarkup(<LiveContentInventory/>);
  for(const text of ['Общая папка Render','Проверить все папки','Сменить папку','Выбрать папку','Проверить','Подробнее','Распределение запаса','Скоро понадобится','Как определяется готовность'])expect(html).toContain(text);
  expect(html).toContain('YouTube API requests: 0');
  expect(html).not.toContain('role="button"');
 });
});
