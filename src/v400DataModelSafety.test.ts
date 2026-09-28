import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {EMPTY_STATE,normalizeChannel} from './store';
import type {AppState,Channel} from './types';

const source=fs.readFileSync('src/store.ts','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');

const legacyChannel:Channel={
 id:'c1',name:'Clover Gramophone',slug:'clover',cadenceDays:1,targetBufferDays:30,publishHour:18,publishMinute:0,
 language:'EN',genre:'Jazz',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
 youtubeProfileId:'profile-uuid-preserved',youtubeChannelId:'UC_preserved',
 renderFolderPath:'/Volumes/TOSHIBA EXT/ВАЙРОН/Render/Clover Gramophone',
 projectsFolderPath:'/Volumes/TOSHIBA EXT/ВАЙРОН/Projects/Clover Gramophone',
 safeDailyUploadLimit:10,
 seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}
};

describe('VYRON 4.0.0 zero-data-loss foundation',()=>{
 it('state schema is additive and initializes owner inventory without deleting legacy domains',()=>{
   expect(EMPTY_STATE.version).toBe(11);
   expect(EMPTY_STATE.ownerYoutubeInventory).toEqual({});
   for(const key of ['channels','jobs','uploadHistory','activityJournal','statisticsHistory','fingerprintCache','projectLifecycle'])expect(EMPTY_STATE).toHaveProperty(key)
 });
 it('channel normalization preserves OAuth/channel/folder/upload limit bindings',()=>{
   const x=normalizeChannel(legacyChannel);
   expect(x.youtubeProfileId).toBe('profile-uuid-preserved');
   expect(x.youtubeChannelId).toBe('UC_preserved');
   expect(x.renderFolderPath).toContain('/Render/Clover Gramophone');
   expect(x.projectsFolderPath).toContain('/Projects/Clover Gramophone');
   expect(x.safeDailyUploadLimit).toBe(10)
 });
 it('hydrate defaults missing owner inventory instead of resetting old state',()=>{
   expect(source).toContain("ownerYoutubeInventory:(s as any).ownerYoutubeInventory&&typeof (s as any).ownerYoutubeInventory==='object'?(s as any).ownerYoutubeInventory:{}");
   expect(source).not.toContain('localStorage.clear(');
   expect(source).not.toContain('youtubeDisconnect(')
 });
 it('owner inventory bridge is mounted once globally and not per page',()=>{
   expect(app).toContain('<OwnerInventoryBridge/>');
   expect(app.match(/<OwnerInventoryBridge\/>/g)).toHaveLength(1)
 });
 it('dashboard YouTube scheduled comes from owner inventory, not local ready inventory',()=>{
   expect(dashboard).toContain('ownerTotals.scheduledCount');
   expect(dashboard).toContain('activeOwner?activeOwner.scheduledCount');
   expect(dashboard).not.toContain('const scheduled=inventory.channels.reduce')
 });
 it('dashboard keeps local stock and owner YouTube inventory as separate KPIs',()=>{
   expect(dashboard).toContain('ЛОКАЛЬНО ГОТОВО');
   expect(dashboard).toContain('OWNER ВИДЕО');
   expect(dashboard).toContain('YOUTUBE SCHEDULED')
 })
});
