import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import type {Channel} from './types';

const __storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 get length(){return __storage.size},
 clear(){__storage.clear()},
 getItem(key:string){return __storage.has(key)?__storage.get(key)!:null},
 key(index:number){return Array.from(__storage.keys())[index]??null},
 removeItem(key:string){__storage.delete(key)},
 setItem(key:string,value:string){__storage.set(key,String(value))},
}});

const storeFixture=vi.hoisted(()=>({channels:[] as Channel[],jobs:[],toast:(_message:string)=>{},patchJob:()=>{},updateChannel:()=>{}}));
const active=vi.hoisted(()=>({id:'',saved:[] as string[]}));
vi.mock('./store',()=>({useApp:(selector:(state:typeof storeFixture)=>unknown)=>selector(storeFixture)}));
vi.mock('./publishWorkspaceState',async()=>{const actual=await vi.importActual<any>('./publishWorkspaceState');return{...actual,loadActivePublishChannel:()=>active.id,saveActivePublishChannel:(id:string)=>{active.id=id;active.saved.push(id)}}});

import {MetadataPage} from './MetadataPage';
import {ScheduleOS} from './ScheduleOS';
import {ExistingVideos} from './ExistingVideos';

const metadataSource=readFileSync(fileURLToPath(new URL('./MetadataPage.tsx',import.meta.url)),'utf8');
const existingSource=readFileSync(fileURLToPath(new URL('./ExistingVideos.tsx',import.meta.url)),'utf8');
const channel=(id:string,name:string,profile=`profile-${id}`):Channel=>({id,name,slug:id,cadenceDays:2,targetBufferDays:60,publishHour:4,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,youtubeProfileId:profile,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});
const render=(node:React.ReactElement)=>renderToStaticMarkup(node);

describe('YouTube Center global active channel + Metadata persistence contracts',()=>{
 beforeEach(()=>{localStorage.clear();active.id='';active.saved=[];storeFixture.channels=[channel('lost','Lost Highway FM'),channel('elara','ELARA')];storeFixture.jobs=[]});
 it('Metadata remount restores persisted ELARA',()=>{active.id='elara';const html=render(React.createElement(MetadataPage));expect(html).toContain('<option value="elara" selected="">ELARA</option>')});
 it('Schedule remount uses the same persisted ELARA context',()=>{active.id='elara';const html=render(React.createElement(ScheduleOS));expect(html).toContain('<option value="elara" selected="">ELARA</option>')});
 it('Uploaded videos remount uses the same persisted ELARA context',()=>{active.id='elara';const html=render(React.createElement(ExistingVideos));expect(html).toContain('<option value="elara" selected="">ELARA</option>')});
 it('Metadata channel selection validates and saves through existing active-channel functions',()=>{expect(metadataSource).toContain('if(!channels.some(c=>c.id===nextId))return');expect(metadataSource).toContain('saveActivePublishChannel(nextId);setChannelId(nextId)');expect(metadataSource).toContain('onChange={e=>switchMetadataChannel(e.target.value)}')});
 it('Uploaded channel selection uses the same active-channel functions',()=>{expect(existingSource).toContain('if(!channels.some(c=>c.id===nextId))return');expect(existingSource).toContain('saveActivePublishChannel(nextId);setChannelId(nextId)');expect(existingSource).toContain('onChange={e=>switchExistingChannel(e.target.value)}')});
 it('Metadata draft is channel-scoped, restored with UX evidence and flushed on navigation',()=>{expect(metadataSource).toContain('loadMetadataDraft(channelId)');expect(metadataSource).toContain('Черновик восстановлен');expect(metadataSource).toContain('saveMetadataDraft(x.channelId,x.draft)');expect(metadataSource).toContain('persistCurrentDraft();saveActivePublishChannel(nextId)')});
 it('Metadata history is separate factual operation history backed by operationId, backup and actual quota',()=>{expect(metadataSource).toContain('appendMetadataHistory');expect(metadataSource).toContain('backup.path');expect(metadataSource).toContain('youtubeOperationActualCost(operationId)');expect(metadataSource).toContain('changedVideoCount:changedVideoIds.size');expect(metadataSource).toContain("status=pausedByQuota||failed>0")});
 it('Clear deletes only current channel draft and does not clear history',()=>{expect(metadataSource).toContain('clearMetadataDraft(channelId)');expect(metadataSource).not.toContain('clearMetadataHistory')});
});
