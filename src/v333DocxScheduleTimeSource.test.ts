import {describe,expect,it,beforeEach} from 'vitest';
import fs from 'node:fs';
import {parseMetadataFile} from './metadata';
import {resolvePublisherBatchSchedule} from './scheduleContinuation';
import {publisherPreflightItems} from './publisherRuntime';
import {loadPublishWorkspace} from './publishWorkspaceState';
import type {VideoJob} from './types';

const publishLines=[
  "28.09.2026 • 07:00 KRAT • Тест A",
  "29.09.2026 • 08:30 KRAT • Тест B",
  "30.09.2026 • 10:00 KRAT • Тест C",
  "01.10.2026 • 07:00 KRAT • Тест A",
  "02.10.2026 • 08:30 KRAT • Тест B",
  "03.10.2026 • 10:00 KRAT • Тест C",
  "04.10.2026 • 07:00 KRAT • Тест A",
  "05.10.2026 • 08:30 KRAT • Тест B",
  "06.10.2026 • 10:00 KRAT • Тест C",
  "07.10.2026 • 07:00 KRAT • Тест A",
  "08.10.2026 • 08:30 KRAT • Тест B",
  "09.10.2026 • 10:00 KRAT • Тест C",
  "10.10.2026 • 07:00 KRAT • Тест A",
  "11.10.2026 • 08:30 KRAT • Тест B",
  "12.10.2026 • 10:00 KRAT • Тест C",
  "13.10.2026 • 07:00 KRAT • Тест A",
  "14.10.2026 • 08:30 KRAT • Тест B",
  "15.10.2026 • 10:00 KRAT • Тест C",
  "16.10.2026 • 07:00 KRAT • Тест A",
  "17.10.2026 • 08:30 KRAT • Тест B",
  "18.10.2026 • 10:00 KRAT • Тест C",
  "19.10.2026 • 08:30 KRAT • Основное окно",
  "20.10.2026 • 08:30 KRAT • Основное окно",
  "21.10.2026 • 08:30 KRAT • Основное окно",
  "22.10.2026 • 08:30 KRAT • Основное окно",
  "23.10.2026 • 08:30 KRAT • Основное окно",
  "24.10.2026 • 08:30 KRAT • Основное окно",
  "25.10.2026 • 08:30 KRAT • Основное окно",
  "26.10.2026 • 08:30 KRAT • Основное окно",
  "27.10.2026 • 08:30 KRAT • Основное окно",
  "28.10.2026 • 08:30 KRAT • Основное окно",
  "29.10.2026 • 08:30 KRAT • Основное окно",
  "30.10.2026 • 08:30 KRAT • Основное окно",
  "31.10.2026 • 08:30 KRAT • Основное окно",
  "01.11.2026 • 08:30 KRAT • Основное окно",
  "02.11.2026 • 08:30 KRAT • Основное окно",
  "03.11.2026 • 08:30 KRAT • Основное окно",
  "04.11.2026 • 08:30 KRAT • Основное окно",
  "05.11.2026 • 08:30 KRAT • Основное окно",
  "06.11.2026 • 08:30 KRAT • Основное окно",
  "07.11.2026 • 08:30 KRAT • Основное окно",
  "08.11.2026 • 08:30 KRAT • Основное окно",
  "09.11.2026 • 08:30 KRAT • Основное окно",
  "10.11.2026 • 08:30 KRAT • Основное окно",
  "11.11.2026 • 08:30 KRAT • Основное окно",
  "12.11.2026 • 08:30 KRAT • Основное окно",
  "13.11.2026 • 08:30 KRAT • Основное окно",
  "14.11.2026 • 08:30 KRAT • Основное окно",
  "15.11.2026 • 08:30 KRAT • Основное окно",
  "16.11.2026 • 08:30 KRAT • Основное окно"
];
const fixtureText=publishLines.map((line,i)=>`VIDEO ${String(i+1).padStart(3,'0')}
TITLE
Fixture title ${i+1}
DESCRIPTION
Fixture description ${i+1}
TAGS
fixture, guitar
PUBLISH
${line}`).join('\n');
const rows=parseMetadataFile('Aether_Riff_SEO_50_Videos_USA.docx',fixtureText);
const jobs=(count:number):VideoJob[]=>Array.from({length:count},(_,i)=>({id:`j${i+1}`,channelId:'fixture-channel',number:i+1,folder:`/fixture/${i+1}`,status:'READY_UPLOAD',createdAt:'2026-09-27T00:00:00.000Z',tracksCount:1,minTracks:1,title:`Fixture ${i+1}`,description:'fixture',tags:['fixture']}));

const mem=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>mem.has(k)?mem.get(k)!:null,
 setItem:(k:string,v:string)=>{mem.set(k,String(v))},
 removeItem:(k:string)=>{mem.delete(k)},
 clear:()=>mem.clear(),
 key:(i:number)=>[...mem.keys()][i]??null,
 get length(){return mem.size}
}});

describe('VYRON 3.3.3 real DOCX schedule/time-source acceptance',()=>{
 beforeEach(()=>mem.clear());

 it('parses all 50 real fixture schedule rows and the first 40 have individual KRAT times',()=>{
  expect(rows).toHaveLength(50);
  expect(rows.slice(0,40).filter(r=>r.publishTime)).toHaveLength(40);
  expect(rows.slice(0,40).filter(r=>r.publishTimezone==='KRAT')).toHaveLength(40);
  expect(rows.slice(0,40).filter(r=>r.publishUtcOffsetMinutes===420)).toHaveLength(40);
  expect(rows[0]).toMatchObject({number:1,publishAt:'2026-09-28',publishTime:'07:00'});
  expect(rows[1]).toMatchObject({number:2,publishAt:'2026-09-29',publishTime:'08:30'});
  expect(rows[2]).toMatchObject({number:3,publishAt:'2026-09-30',publishTime:'10:00'});
  expect(rows[21]).toMatchObject({number:22,publishAt:'2026-10-19',publishTime:'08:30'});
  expect(rows[49]).toMatchObject({number:50,publishAt:'2026-11-16',publishTime:'08:30'});
 });

 it('DAILY + FILE TIME produces 40 valid publishAt values and zero schedule/time blocks',()=>{
  const selected=jobs(40),selectedRows=rows.slice(0,40);
  const schedule=resolvePublisherBatchSchedule({mode:'daily',startDate:'2026-09-28',time:'18:00',count:40,timeSource:'file',fileTimeRows:selectedRows,now:new Date('2026-09-27T00:00:00.000Z')});
  expect(schedule.items.filter(x=>Boolean(x.publishAt))).toHaveLength(40);
  const missingTimeIds=new Set(selected.filter((_j,i)=>!selectedRows[i]?.publishTime).map(j=>j.id));
  const preflight=publisherPreflightItems(selected,{getPublishAt:j=>schedule.items[selected.findIndex(x=>x.id===j.id)]?.publishAt,missingPublishTimeIds:missingTimeIds,safeMode:false,nowMs:Date.parse('2026-09-27T00:00:00.000Z')});
  expect(preflight.ready).toHaveLength(40);
  expect(preflight.items.flatMap(x=>x.issues).filter(x=>x.code==='MISSING_SCHEDULE')).toHaveLength(0);
  expect(preflight.items.flatMap(x=>x.issues).filter(x=>x.code==='PUBLISH_TIME_REQUIRED')).toHaveLength(0);
 });

 it('old saved Publisher drafts default to COMMON TIME without clearing or migrating storage',()=>{
  localStorage.setItem('vyron:youtube-publish-workspaces:v2',JSON.stringify({c:{channelId:'c',selectedIds:['j1'],rows:[],docx:false,thumbs:[],allowMissingThumbs:false,allowDuplicate:false,scheduleMode:'daily',scheduleStartDate:'2026-09-28',scheduleTime:'18:00',updatedAt:'2026-09-27T00:00:00.000Z'}}));
  const draft=loadPublishWorkspace('c');
  expect(draft.scheduleTimeSource).toBe('common');
  expect(draft.selectedIds).toEqual(['j1']);
  expect(localStorage.getItem('vyron:youtube-publish-workspaces:v2')).toBeTruthy();
 });

 it('Publisher UI exposes minimal file/common time source controls and keeps dry-run error separation',()=>{
  const ui=fs.readFileSync('src/PublisherOS.tsx','utf8');
  expect(ui).toContain('Источник времени');
  expect(ui).toContain('Время берётся отдельно из метаданных каждого VIDEO');
  expect(ui).toContain("scheduleTimeSource==='file'");
  expect(ui).toContain("!publishAt&&!missingPublishTimeIds.has(j.id)");
  expect(ui).toContain('PUBLISH_AT_REQUIRED');
  expect(ui).toContain('PUBLISH_TIME_REQUIRED');
 });

 it('hotfix production surface contains no direct localStorage.clear or OAuth/keychain mutations',()=>{
  const changed=['src/metadata.ts','src/publisherMetadata.ts','src/publisherSchedule.ts','src/scheduleContinuation.ts','src/publishWorkspaceState.ts','src/publisherRuntime.ts','src/PublisherOS.tsx'];
  const text=changed.map(p=>fs.readFileSync(p,'utf8')).join('\n');
  expect(text).not.toContain('localStorage.clear(');
  expect(text).not.toContain('youtubeDisconnect(');
  expect(text).not.toContain('removeChannel(');
  expect(text).not.toContain('canonical_delete_secret(');
  expect(text).not.toMatch(/clear.*keychain/i);
  expect(text).not.toMatch(/reset.*vault/i);
 });
});
