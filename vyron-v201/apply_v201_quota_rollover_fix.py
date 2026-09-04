#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
def r(p): return (ROOT/p).read_text()
def w(p,s): (ROOT/p).write_text(s)
def rep(p,a,b,count=1):
    s=r(p)
    if a not in s: raise SystemExit(f'v201 quota rollover missing anchor {p}: {a[:180]!r}')
    w(p,s.replace(a,b,count))

# -----------------------------------------------------------------------------
# 2.0.1: quota rollover / manual synchronization recovery.
# The local 10k ledger and the provider quota guard are different things.
# A historical provider guard must never survive into a new Pacific quota day,
# and an explicit user Sync click is allowed one real probe when local quota is
# available. If YouTube still returns quotaExceeded, the provider guard is
# latched again for the current window.
# -----------------------------------------------------------------------------
p='src/youtubeQuota.ts';s=r(p)
s=s.replace(
"export type YoutubeQuotaGuard={blocked:boolean;reason?:string;at?:string;resetAt?:string};",
"export type YoutubeQuotaGuard={blocked:boolean;reason?:string;at?:string;resetAt?:string;ptDate?:string;source?:'provider'};"
)

old="function tickClock(){const x=youtubeQuotaClockSnapshot();for(const cb of clockSubs)cb(x)}"
new="""let lastClockPtDate=youtubePtDate();
function tickClock(){const x=youtubeQuotaClockSnapshot(),day=youtubePtDate(x.now),rolled=day!==lastClockPtDate;lastClockPtDate=day;youtubeQuotaState(x.now);if(rolled){readLedger();emit()}for(const cb of clockSubs)cb(x)}"""
if old not in s: raise SystemExit('v201 tickClock anchor missing')
s=s.replace(old,new,1)

old="function readReservations():Reservation[]{try{const x=JSON.parse(lsGet(RESERVATION_KEY)||'[]');return Array.isArray(x)?x.filter(r=>r?.id&&r?.buckets):[]}catch{return[]}}"
new="""function readReservations():Reservation[]{try{const x=JSON.parse(lsGet(RESERVATION_KEY)||'[]'),day=youtubePtDate();return Array.isArray(x)?x.filter(r=>r?.id&&r?.buckets&&(!r.createdAt||youtubePtDate(new Date(r.createdAt))===day)):[]}catch{return[]}}"""
if old not in s: raise SystemExit('v201 reservation anchor missing')
s=s.replace(old,new,1)

old="""export function youtubeQuotaState():YoutubeQuotaGuard{try{const x=JSON.parse(lsGet(GUARD_KEY)||'null');if(x?.blocked){if(x.resetAt&&Date.now()>=Date.parse(x.resetAt)){clearYoutubeQuotaGuard();return{blocked:false}}return x}}catch{}return{blocked:false}}
export function markYoutubeQuotaExceeded(reason:unknown){const g:YoutubeQuotaGuard={blocked:true,reason:String(reason||'YouTube API quota exceeded'),at:new Date().toISOString(),resetAt:nextYoutubeQuotaResetAt().toISOString()};lsSet(GUARD_KEY,JSON.stringify(g));emit();return g}
export function clearYoutubeQuotaGuard(){try{if(typeof localStorage!=='undefined')localStorage.removeItem(GUARD_KEY)}catch{}emit()}
export function youtubeQuotaMessage(){const g=youtubeQuotaState();return g.blocked?`YouTube API quota временно исчерпана. Сброс: ${youtubeQuotaResetLocalInfo().time}.`:'YouTube API quota доступна.'}
export function isYoutubeQuotaError(error:unknown){const s=String(error||'').toLowerCase();return s.includes('quota')||s.includes('dailylimit')||s.includes('daily limit')||s.includes('rate limit exceeded')}
export async function youtubeGuardedCall<T>(fn:()=>Promise<T>){const g=youtubeQuotaState();if(g.blocked)throw new Error(youtubeQuotaMessage());try{return await fn()}catch(e){if(isYoutubeQuotaError(e))markYoutubeQuotaExceeded(e);throw e}}"""
new="""export function shouldClearYoutubeQuotaGuard(g:YoutubeQuotaGuard,now=new Date()){if(!g?.blocked)return false;const day=youtubePtDate(now);if(g.ptDate&&g.ptDate!==day)return true;if(g.resetAt){const reset=Date.parse(g.resetAt);if(Number.isFinite(reset)&&now.getTime()>=reset)return true}return false}
export function youtubeQuotaState(now=new Date()):YoutubeQuotaGuard{try{const x=JSON.parse(lsGet(GUARD_KEY)||'null') as YoutubeQuotaGuard|null;if(x?.blocked){if(shouldClearYoutubeQuotaGuard(x,now)){clearYoutubeQuotaGuard();return{blocked:false}}return x}}catch{}return{blocked:false}}
export function markYoutubeQuotaExceeded(reason:unknown){const now=new Date(),g:YoutubeQuotaGuard={blocked:true,reason:String(reason||'YouTube API quota exceeded'),at:now.toISOString(),resetAt:nextYoutubeQuotaResetAt(now).toISOString(),ptDate:youtubePtDate(now),source:'provider'};lsSet(GUARD_KEY,JSON.stringify(g));emit();return g}
export function clearYoutubeQuotaGuard(){try{if(typeof localStorage!=='undefined')localStorage.removeItem(GUARD_KEY)}catch{}emit()}
export function youtubeQuotaMessage(){const g=youtubeQuotaState();return g.blocked?`YouTube API вернул quotaExceeded. Ручная синхронизация может выполнить один контрольный запрос. Сброс: ${youtubeQuotaResetLocalInfo().time}.`:'YouTube API quota доступна.'}
export function isYoutubeQuotaError(error:unknown){const s=String(error||'').toLowerCase();return s.includes('quotaexceeded')||s.includes('dailylimitexceeded')||s.includes('ratelimitexceeded')||s.includes('rate limit exceeded')||s.includes('daily limit exceeded')||s.includes('quota exceeded')}
export function beginManualYoutubeQuotaProbe(){const g=youtubeQuotaState();if(!g.blocked)return true;const u=youtubeQuotaUsage();if(u.used>=u.limit)return false;clearYoutubeQuotaGuard();return true}
export async function youtubeGuardedCall<T>(fn:()=>Promise<T>){const g=youtubeQuotaState();if(g.blocked)throw new Error(`YOUTUBE_LOCAL_QUOTA_PAUSE: ${youtubeQuotaMessage()}`);try{return await fn()}catch(e){if(isYoutubeQuotaError(e))markYoutubeQuotaExceeded(e);throw e}}"""
if old not in s: raise SystemExit('v201 quota guard block anchor missing')
s=s.replace(old,new,1)
w(p,s)

# Manual Metadata Sync must actually reach YouTube when local quota exists.
p='src/MetadataPage.tsx';s=r(p)
old="import {isYoutubeQuotaError,markYoutubeQuotaExceeded,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeOperationActualCost,youtubeQuotaClockSnapshot,youtubeQuotaMessage,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';"
new="import {beginManualYoutubeQuotaProbe,isYoutubeQuotaError,markYoutubeQuotaExceeded,planYoutubeQuota,releaseYoutubeQuotaReservation,reserveYoutubeQuota,subscribeYoutubeQuota,subscribeYoutubeQuotaClock,youtubeOperationActualCost,youtubeQuotaClockSnapshot,youtubeQuotaMessage,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';"
if old not in s: raise SystemExit('v201 Metadata quota import anchor missing')
s=s.replace(old,new,1)
old="async function loadYoutube(){if(!profileId){setSyncStatus('OAuth не подключён');return}if(youtubeQuotaState().blocked){setSyncStatus(youtubeQuotaMessage());return}setBusy(true);try{"
new="async function loadYoutube(){if(!profileId){setSyncStatus('OAuth не подключён');return}if(!beginManualYoutubeQuotaProbe()){setSyncStatus(youtubeQuotaMessage());return}setBusy(true);setSyncStatus('↻ Запрашиваю актуальные видео у YouTube…');try{"
if old not in s: raise SystemExit('v201 Metadata loadYoutube preflight anchor missing')
s=s.replace(old,new,1)
w(p,s)

# Quota card: do not imply that the local 10k estimate itself is exhausted when
# the provider guard is the thing that rejected a request.
p='src/QuotaMeter.tsx';s=r(p)
s=s.replace("<h3>{guard.blocked?'Пауза по квоте':'Локальный ledger'}</h3><p>Расход считается по фактически предпринятым API method calls. Countdown локальный и не обращается к YouTube.</p>","<h3>{guard.blocked?'YouTube API отклонил запрос':'Локальный ledger'}</h3><p>{guard.blocked?'Сервер YouTube вернул quotaExceeded. Число «Осталось» ниже — локальный ledger, а не чтение реального баланса Google. Ручная синхронизация делает один контрольный запрос.':'Расход считается по фактически предпринятым API method calls. Countdown локальный и не обращается к YouTube.'}</p>")
s=s.replace("{guard.blocked?'QUOTA EXCEEDED':'TRACKING'}","{guard.blocked?'PROVIDER QUOTA':'TRACKING'}")
w(p,s)

# Pure regression tests do not depend on browser storage.
w('src/youtubeQuotaRollover.test.ts',r'''import {describe,it,expect} from 'vitest';
import {isYoutubeQuotaError,shouldClearYoutubeQuotaGuard} from './youtubeQuota';
describe('YouTube quota rollover 2.0.1',()=>{
 it('clears a provider guard from an older Pacific quota day',()=>{expect(shouldClearYoutubeQuotaGuard({blocked:true,ptDate:'2026-09-03',resetAt:'2026-09-04T07:00:00.000Z'},new Date('2026-09-04T08:00:00.000Z'))).toBe(true)});
 it('keeps a current-window provider guard until its reset',()=>{expect(shouldClearYoutubeQuotaGuard({blocked:true,ptDate:'2026-09-04',resetAt:'2026-09-05T07:00:00.000Z'},new Date('2026-09-04T20:00:00.000Z'))).toBe(false)});
 it('does not re-latch on VYRON local quota copy',()=>{expect(isYoutubeQuotaError('YouTube API quota временно исчерпана. Сброс: 14:00.')).toBe(false);expect(isYoutubeQuotaError('The request cannot be completed because you have exceeded your quota. [quotaExceeded]')).toBe(true)});
});
''')
print('VYRON 2.0.1 quota rollover/manual-sync fix applied')
