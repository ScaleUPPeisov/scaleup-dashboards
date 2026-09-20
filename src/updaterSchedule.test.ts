import {describe,expect,it} from 'vitest';
import {UPDATER_AUTO_INTERVAL_MS,UPDATER_FOREGROUND_MIN_AGE_MS,UPDATER_MAX_BACKOFF_MS,shouldRunUpdaterAgeCheck,updaterBackoffMs,updaterNextAutomaticCheckAt} from './updaterSchedule';

describe('RC5 rapid updater scheduling policy',()=>{
  it('defines one canonical 15m automatic interval and 5m foreground/network age',()=>{
    expect(UPDATER_AUTO_INTERVAL_MS).toBe(15*60*1000);
    expect(UPDATER_FOREGROUND_MIN_AGE_MS).toBe(5*60*1000);
  });
  it('runs foreground/network trigger only after five minutes',()=>{
    const now=1_000_000;
    expect(shouldRunUpdaterAgeCheck(undefined,now)).toBe(true);
    expect(shouldRunUpdaterAgeCheck(now-UPDATER_FOREGROUND_MIN_AGE_MS+1,now)).toBe(false);
    expect(shouldRunUpdaterAgeCheck(now-UPDATER_FOREGROUND_MIN_AGE_MS,now)).toBe(true);
  });
  it('uses bounded 15m/30m/60m failure backoff and resets through zero failures',()=>{
    expect(updaterBackoffMs(0)).toBe(UPDATER_AUTO_INTERVAL_MS);
    expect(updaterBackoffMs(1)).toBe(UPDATER_AUTO_INTERVAL_MS);
    expect(updaterBackoffMs(2)).toBe(30*60*1000);
    expect(updaterBackoffMs(3)).toBe(UPDATER_MAX_BACKOFF_MS);
    expect(updaterBackoffMs(99)).toBe(UPDATER_MAX_BACKOFF_MS);
  });
  it('computes next automatic check from factual completion time',()=>{
    expect(updaterNextAutomaticCheckAt(1000,0,500)).toBe(1000+UPDATER_AUTO_INTERVAL_MS);
    expect(updaterNextAutomaticCheckAt(1000,2,500)).toBe(1000+30*60*1000);
  });
});
