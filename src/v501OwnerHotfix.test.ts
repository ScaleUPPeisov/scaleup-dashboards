import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {planStatisticsProjectBatches} from './youtubeChannelStatsRuntime';
import {STARTUP_QUOTA_HARD_MAX,STARTUP_QUOTA_PROBE_MS,STARTUP_QUOTA_TARGET_MAX,classifyStartupQuotaDelta} from './startupQuotaProbe';

const statsScheduler=fs.readFileSync('src/ChannelStatisticsScheduler.tsx','utf8');
const ownerScheduler=fs.readFileSync('src/OwnerInventoryScheduler.tsx','utf8');
const processingMonitor=fs.readFileSync('src/UploadProcessingMonitor.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');
const autopilot=fs.readFileSync('src/autopilotRuntime.ts','utf8');
const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');
const settings=fs.readFileSync('src/SettingsOS.tsx','utf8');
const styles=fs.readFileSync('src/styles.css','utf8');
const localDelete=fs.readFileSync('src-tauri/src/local_delete.rs','utf8');

function linked(i:number,client='123.apps.googleusercontent.com'){
 return {
  channel:{id:'c'+i,name:'Channel '+i},
  profile:{id:'p'+i,clientIdMasked:client,credentialStatus:'READY'},
  youtubeChannelId:'UC'+String(i).padStart(22,'0')
 } as any;
}

describe('VYRON 5.0.1 owner hotfix contract',()=>{
 it('requires exact zero YouTube quota for ten idle minutes',()=>{
  expect(STARTUP_QUOTA_PROBE_MS).toBe(600_000);
  expect(STARTUP_QUOTA_TARGET_MAX).toBe(0);
  expect(STARTUP_QUOTA_HARD_MAX).toBe(0);
  expect(classifyStartupQuotaDelta(0)).toBe('TARGET');
  expect(classifyStartupQuotaDelta(1)).toBe('FAIL');
 });
 it('removes automatic statistics inventory and processing polling',()=>{
  expect(statsScheduler).not.toContain('setInterval');
  expect(statsScheduler).not.toContain('setTimeout');
  expect(statsScheduler).not.toContain('refreshYoutubeChannelStatistics(');
  expect(ownerScheduler).not.toContain('setInterval');
  expect(ownerScheduler).not.toContain('setTimeout');
  expect(ownerScheduler).not.toContain('refreshStaleOwnerInventories(');
  expect(processingMonitor).not.toContain('setInterval');
  expect(processingMonitor).not.toContain('setTimeout');
  expect(processingMonitor).toContain('export function UploadProcessingMonitor(){\n return null;');
 });
 it('does not recover OAuth or upload to YouTube automatically',()=>{
  expect(app).not.toContain('youtubeOauthRecoverExistingProfiles()');
  expect(autopilot).not.toContain('runYoutubeAutopilotForChannel');
  expect(autopilot).not.toContain('autoUploadYoutube');
  expect(settings).toContain('YouTube Autopilot: OFF');
 });
 it('keeps processing checks as an explicit owner command',()=>{
  expect(publisher).toContain('Проверить статус YouTube');
  expect(publisher).toContain('reconcileExistingUploads()');
  expect(publisher).toContain('youtubeVideoProcessingStatusBatch');
 });
 it('shows cached all-channel network statistics and manual quota preview',()=>{
  expect(dashboard).toContain('ВСЕ КАНАЛЫ');
  expect(dashboard).toContain('Автообновление YouTube: <b>ВЫКЛ</b>');
  expect(dashboard).toContain('↻ ОБНОВИТЬ ВСЕ КАНАЛЫ');
  expect(dashboard).toContain('planStatisticsProjectBatches');
  expect(dashboard).toContain('channels.list requests');
  expect(dashboard).toContain('ОТМЕНА');
  expect(dashboard).toContain("values.length?(values.length<enabled.length?'≥ ':'')+fmt(total):'—'");
 });
 it('batches 32 compatible channels into one channels.list and splits above 50',()=>{
  const one=planStatisticsProjectBatches(Array.from({length:32},(_,i)=>linked(i)),null,50);
  expect(one).toHaveLength(1);
  expect(one[0].channelIds).toHaveLength(32);
  const two=planStatisticsProjectBatches(Array.from({length:51},(_,i)=>linked(i)),null,50);
  expect(two).toHaveLength(2);
  expect(two.map(x=>x.channelIds.length)).toEqual([50,1]);
  const groups=planStatisticsProjectBatches([...Array.from({length:16},(_,i)=>linked(i,'A.apps.googleusercontent.com')),...Array.from({length:16},(_,i)=>linked(i+16,'B.apps.googleusercontent.com'))],null,50);
  expect(groups).toHaveLength(2);
 });
 it('keeps local cleanup and file scans local-only',()=>{
  const cleanupStart=publisher.indexOf('async function removeReady');
  const cleanupEnd=publisher.indexOf('async function fingerprintForJob',cleanupStart);
  const cleanup=publisher.slice(cleanupStart,cleanupEnd);
  for(const forbidden of ['youtubeVideoProcessingStatus(','youtubeVideoProcessingStatusBatch(','youtubeListExisting(','youtubeRetryExistingHydration('])expect(cleanup).not.toContain(forbidden);
  expect(cleanup).toContain('youtubeApiRequests:0');
  expect(cleanup).toContain('trashLocalFile');
  expect(cleanup).toContain("scanRenderFolder('cleanup')");
 });
 it('provides RPM configuration and direct dashboard focus',()=>{
  expect(settings).toContain('id="vyron-rpm-settings"');
  expect(settings).toContain('estimatedRpmUsd');
  expect(settings).toContain('views ÷ 1000 × configured RPM');
  expect(settings).toContain('Не является подтверждённым доходом YouTube');
  expect(dashboard).toContain("vyron:settings-target-section");
 });
 it('pins owner profile and Local Core in one sidebar footer',()=>{
  expect(app).toContain('<div className="sidebarFooter"><OwnerProfile/>');
  expect(styles).toContain('.sidebarFooter{flex:0 0 auto;margin-top:auto');
  expect(styles).toContain('.sidebar .sidebarNav{flex:1 1 auto;min-height:0;overflow-y:auto');
  expect(styles).toContain('transform:none!important');
 });
 it('implements one VYRON root with non-destructive Projects/Render migration',()=>{
  expect(settings).toContain('Корневая папка ВАЙРОН');
  expect(settings).toContain('WILL DELETE');
  expect(settings).toContain('vyronFilesystemPreview');
  expect(settings).toContain('vyronFilesystemApply');
  const start=localDelete.indexOf('pub fn vyron_filesystem_apply_impl');
  const end=localDelete.indexOf('fn allowed_media',start);
  const implementation=localDelete.slice(start,end);
  expect(implementation).toContain('root.join("Projects")');
  expect(implementation).toContain('root.join("Render")');
  expect(implementation).toContain('fs::rename');
  expect(implementation).not.toContain('remove_file');
  expect(implementation).not.toContain('remove_dir');
  expect(implementation).toContain('will_delete:0');
 });
});
