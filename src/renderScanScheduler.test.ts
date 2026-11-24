import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createRenderScanScheduler,HIDDEN_RENDER_SCAN_MS,VISIBLE_RENDER_SCAN_MS} from './renderScanScheduler';
import {replaceFactualActiveRenders,resetActiveOperationFactsForTests,setRenderMonitoringExpected,invalidateRenderFacts} from './activeOperationFacts';
import {collectUpdaterBlockers} from './updaterGuard';

describe('render scan scheduler',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(100_000)});
 afterEach(()=>{vi.useRealTimers();resetActiveOperationFactsForTests()});
 it('polls less often while hidden and checks immediately on return',async()=>{
  let visible=true;const scan=vi.fn(async()=>{});
  const scheduler=createRenderScanScheduler({scan,isVisible:()=>visible});
  scheduler.request();await vi.advanceTimersByTimeAsync(0);
  expect(scan).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(VISIBLE_RENDER_SCAN_MS);expect(scan).toHaveBeenCalledTimes(2);
  visible=false;scheduler.visibilityChanged();
  await vi.advanceTimersByTimeAsync(HIDDEN_RENDER_SCAN_MS-1);expect(scan).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(1);expect(scan).toHaveBeenCalledTimes(3);
  visible=true;scheduler.visibilityChanged();await vi.advanceTimersByTimeAsync(0);expect(scan).toHaveBeenCalledTimes(4);
  scheduler.stop();await vi.advanceTimersByTimeAsync(HIDDEN_RENDER_SCAN_MS*2);expect(scan).toHaveBeenCalledTimes(4)
 });
 it('coalesces requests during a slow scan without starting overlapping work',async()=>{
  let finish!:()=>void,active=0,maxActive=0;
  const scan=vi.fn(async()=>{active++;maxActive=Math.max(maxActive,active);if(active===1&&scan.mock.calls.length===1)await new Promise<void>(r=>{finish=r});active--});
  const scheduler=createRenderScanScheduler({scan,isVisible:()=>true});
  scheduler.request();scheduler.request();scheduler.request();
  await vi.advanceTimersByTimeAsync(VISIBLE_RENDER_SCAN_MS*3);
  expect(scan).toHaveBeenCalledTimes(1);expect(maxActive).toBe(1);
  finish();await vi.advanceTimersByTimeAsync(0);
  expect(scan).toHaveBeenCalledTimes(2);expect(maxActive).toBe(1);
  scheduler.stop()
 });
 it('does not restart after pause or stop while a scan is in flight',async()=>{
  let finish!:()=>void;const scan=vi.fn(()=>new Promise<void>(r=>{finish=r}));
  const scheduler=createRenderScanScheduler({scan,isVisible:()=>true});
  scheduler.request();scheduler.request();scheduler.pause();finish();await vi.advanceTimersByTimeAsync(30_000);
  expect(scan).toHaveBeenCalledTimes(1);scheduler.stop();scheduler.request();expect(scan).toHaveBeenCalledTimes(1)
 });
 it('blocks updates while monitored render facts are missing or stale',()=>{
  const count={uploads:0,renders:0};
  // Standalone callers with no running monitor keep their established semantics.
  expect(collectUpdaterBlockers([],[],count)).toEqual([]);
  setRenderMonitoringExpected(true);
  expect(collectUpdaterBlockers([],[],count)[0]?.kind).toBe('RENDERS_UNKNOWN');
  replaceFactualActiveRenders([],Date.now());
  expect(collectUpdaterBlockers([],[],count)).toEqual([]);
  invalidateRenderFacts();expect(collectUpdaterBlockers([],[],count)[0]?.kind).toBe('RENDERS_UNKNOWN');
  replaceFactualActiveRenders([],Date.now());
  vi.advanceTimersByTime(20_001);
  expect(collectUpdaterBlockers([],[],count)[0]?.kind).toBe('RENDERS_UNKNOWN');
  replaceFactualActiveRenders(['job'],Date.now());
  expect(collectUpdaterBlockers([],[],{uploads:0,renders:1})[0]?.kind).toBe('RENDERS');
  setRenderMonitoringExpected(false);
  expect(collectUpdaterBlockers([],[],count)).toEqual([])
 });
});
