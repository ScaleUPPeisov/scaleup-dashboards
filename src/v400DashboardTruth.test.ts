import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const dashboard=fs.readFileSync('src/DashboardOS.tsx','utf8');
const owner=fs.readFileSync('src/youtubeOwnerInventory.ts','utf8');
const scheduler=fs.readFileSync('src/OwnerInventoryScheduler.tsx','utf8');
const app=fs.readFileSync('src/App.tsx','utf8');

describe('VYRON 4.0.0 dashboard truth separation',()=>{
 it('uses owner-authorized inventory for YouTube scheduled and keeps local ready separate',()=>{
   expect(dashboard).toContain('aggregateOwnerInventories');
   expect(dashboard).toContain('YOUTUBE SCHEDULED');
   expect(dashboard).toContain('ЛОКАЛЬНО ГОТОВО');
   expect(dashboard).toContain('ownerTotals.scheduled');
   expect(dashboard).not.toContain('inventory.channels.reduce((n,x)=>n+x.scheduled');
 });
 it('does not use public channel videoCount as owner total',()=>{
   // Owner-authorized uploads are a separate section from public channel stats.
   expect(dashboard).toContain('const ownerVideoValue=ownerTotals.availableChannels?ownerPrefix+fmt(ownerTotals.total)');
   expect(dashboard).toContain('<small>Всего owner-visible</small><b>{ownerVideoValue}</b>');
   expect(dashboard).toContain('Public channel videoCount здесь не используется как абсолютн');
   // Public statistics can still be shown independently, with a partial-data prefix.
   expect(dashboard).toContain('const videoValues=enabled.map(c=>c.stats?.videoCount??c.stats?.videos)');
   expect(dashboard).toContain('aggregate(videoValues,videoTotal)');
 });
 it('owner inventory classifies schedule only from real private + future publishAt',()=>{
   expect(owner).toContain("privacy==='private'");
   expect(owner).toContain('isFuture(video.publishAt,nowMs)');
   expect(owner).toContain('scheduled++');
   expect(owner).not.toContain('renderFolderPath');
   expect(owner).not.toContain('readyVideos');
 });
 it('smart scheduler reuses cache and does not refresh on every page transition',()=>{
   expect(owner).toContain('OWNER_INVENTORY_TTL_MS=6*60*60*1000');
   expect(owner).toContain('ownerInventoryCacheStale');
   // Later 5.0.1 intentionally disables automatic owner refresh on navigation.
   // Keep cache-first operation: never restore the old timers to satisfy a 4.0 assertion.
   expect(scheduler).toContain('manual-only');
   expect(scheduler).toContain('return null;');
   expect(scheduler).not.toContain('setTimeout(');
   expect(scheduler).not.toContain('setInterval(');
   expect(app).toContain('<OwnerInventoryScheduler/>');
 });
 it('Today block exposes daily operational state without using local stock as YouTube schedule',()=>{
   expect(dashboard).toContain('Активных каналов');
   expect(dashboard).toContain('Активные ошибки');
   expect(dashboard).toContain('activeTodayChannels');
   expect(dashboard).toContain('ownerTotals.nextScheduledAt');
 });
 it('dashboard treats missing subscriber data as unavailable, not zero',()=>{
   expect(dashboard).toContain("hiddenSubscriberCount?undefined");
   expect(dashboard).toContain("const aggregate=(values:number[],total:number)=>values.length?");
   expect(dashboard).toContain(":'—'");
   expect(dashboard).toContain('aggregate(subscriberValues,subscriberTotal)');
   expect(dashboard).toContain("values.length<enabled.length?'≥ ':'')");
 });
});
