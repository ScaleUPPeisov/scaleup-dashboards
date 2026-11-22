import {api} from './api';
import {hydrateExistingInventoryCaches,readAuthoritativeExistingSnapshot,readExistingCache,replaceExistingCacheFromSync,scheduleSyncTruthFromInfo} from './channelSchedule';
import {deriveRunwayRecord} from './channelRunwayCore';
import type {Channel,YoutubeExistingVideo} from './types';
import {markYoutubeCache} from './youtubeCache';
import {bindYoutubeQuotaTraceContext,youtubeOperationActualCost,youtubeQuotaBucketUsage,youtubeQuotaState,youtubeQuotaUsage} from './youtubeQuota';
import {classifyYoutubeChannels} from './youtubeStatisticsCenter';
import {loadChannelRunwayStore,markRunwayRefreshIssue,upsertChannelRunwayFromYoutube} from './channelRunwayStore';

export const OWNER_INVENTORY_TTL_MS=6*60*60*1000;
export const OWNER_INVENTORY_EVENT='vyron:owner-inventory-refresh';
const ownerInventoryRuns=new Map<string,Promise<OwnerInventoryRefreshSummary>>();
const ownerAttemptAt=new Map<string,number>();
const ownerSearchAt=new Map<string,number>();
const OWNER_SEARCH_COOLDOWN_MS=10*60*1000;
// Native hydration budget: at most 500 *additional* owner-known IDs.
// Forward all valid input IDs so playlist/Search duplicates do not use the cap;
// native reports overflow if there are >500 still-uncovered IDs.
export const OWNER_KNOWN_VIDEO_ID_LIMIT=500;
// Explicit full-fleet runs can deep-check incomplete channels only: 2 pages
// per channel, up to 33 channels, with a search-bucket reserve for other work.
export const MANUAL_FLEET_DEEP_SEARCH_CHANNEL_CAP=33;
export const MANUAL_FLEET_SEARCH_MIN_AVAILABLE=12;

export type OwnerYoutubeInventorySnapshot={
  channelId:string;
  available:boolean;
  complete:boolean;
  updatedAt?:string;
  total:number;
  public:number;
  private:number;
  scheduled:number;
  unlisted:number;
  published:number;
  nextScheduledAt?:string;
  lastScheduledAt?:string;
  publishedToday:number;
};

export type OwnerYoutubeInventoryTotals={
  availableChannels:number;
  completeChannels:number;
  partialChannels:number;
  total:number;
  public:number;
  private:number;
  scheduled:number;
  unlisted:number;
  published:number;
  publishedToday:number;
  nextScheduledAt?:string;
};

const isFuture=(iso:string|undefined,now:number)=>Boolean(iso&&Number.isFinite(Date.parse(iso))&&Date.parse(iso)>now);

// Owner-verified upload IDs are an independent discovery source for videos.list.
// YouTube may omit private Scheduled videos from the uploads playlist. Preserve
// future Scheduled first; then recent successful uploads lacking a publishAt.
// Every ID is hydrated again under the EXACT connected OAuth owner Channel ID.
// Never trust a history entry as current Scheduled without videos.list status.
export function knownOwnerVideoIdsFromUploadHistory<T extends {
  channelId:string;status:string;youtubeVideoId?:string|null;
  youtubeChannelId?:string;profileId?:string;publishAt?:string|null;
}>(history:readonly T[],channel:Pick<Channel,'id'|'youtubeChannelId'|'youtubeProfileId'>,nowMs=Date.now()){
  const eligible=history.map((row,index)=>({row,index})).filter(({row})=>
    row.channelId===channel.id&&row.status==='UPLOADED'&&
    (!row.youtubeChannelId||row.youtubeChannelId===channel.youtubeChannelId)&&
    (!row.profileId||row.profileId===channel.youtubeProfileId)&&
    /^[A-Za-z0-9_-]{11}$/.test(String(row.youtubeVideoId||'')));
  const scheduled=eligible.filter(({row})=>isFuture(row.publishAt||undefined,nowMs))
    .sort((a,b)=>Date.parse(b.row.publishAt!)-Date.parse(a.row.publishAt!));
  const recent=eligible.filter(({row})=>!isFuture(row.publishAt||undefined,nowMs))
    .sort((a,b)=>b.index-a.index);
  // Forward the full known-ID set: the native bounded verifier counts only
  // IDs absent from the uploads playlist and owner Search. Cutting input to
  // 501 here could hide an unknown Scheduled ID behind 500 already-known IDs.
  return [...new Set([...scheduled,...recent].map(({row})=>String(row.youtubeVideoId)))]
}
const sameLocalDay=(iso:string|undefined,now:Date)=>{
  if(!iso)return false;
  const d=new Date(iso);
  return !Number.isNaN(d.getTime())&&d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth()&&d.getDate()===now.getDate()
};

export function ownerInventoryFromVideos(channelId:string,videos:YoutubeExistingVideo[],updatedAt?:string,syncInfo?:unknown,nowMs=Date.now()):OwnerYoutubeInventorySnapshot{
  const now=new Date(nowMs);
  let publicCount=0,privateCount=0,scheduled=0,unlisted=0,publishedToday=0;
  const future:string[]=[];
  for(const video of videos){
    const privacy=String(video.privacyStatus||'').toLowerCase();
    if(privacy==='private'){
      if(isFuture(video.publishAt,nowMs)){scheduled++;future.push(video.publishAt!)}
      else privateCount++;
      continue
    }
    if(privacy==='public'){
      publicCount++;
      if(sameLocalDay(video.publishedAt,now))publishedToday++;
      continue
    }
    if(privacy==='unlisted'){
      unlisted++;
      if(sameLocalDay(video.publishedAt,now))publishedToday++
    }
  }
  future.sort((a,b)=>Date.parse(a)-Date.parse(b));
  return{
    channelId,
    available:true,
    complete:scheduleSyncTruthFromInfo(syncInfo)==='complete',
    updatedAt,
    total:videos.length,
    public:publicCount,
    private:privateCount,
    scheduled,
    unlisted,
    published:publicCount+unlisted,
    nextScheduledAt:future[0],
    lastScheduledAt:future.at(-1),
    publishedToday
  }
}

export function scheduledCoverageEstablished(result:{
  scheduleComplete?:boolean;syncComplete?:boolean;complete?:boolean;scheduledCoverageVerified?:boolean;
  searchUsed?:boolean;searchExhausted?:boolean;searchError?:string|null;
  searchLimitReached?:boolean;supplementalMissingCount?:number;knownScheduledIdsTruncated?:boolean;
  historyOnlyScheduledOutsideSearchCount?:number;videos?:YoutubeExistingVideo[]
},_nowMs=Date.now()){
  if(!(result.syncComplete??result.complete)||result.scheduleComplete!==true)return false;
  // Native 6.1.29+ emits the explicit attestation. Accept a legacy 6.1.28
  // snapshot only when the persisted evidence proves the same contract:
  // exact-owner Search exhausted, no page cap/error, and every extra/history ID
  // was hydrated without truncation.
  return result.scheduledCoverageVerified===true||
    (result.searchUsed===true&&result.searchExhausted===true&&!result.searchError&&
      result.searchLimitReached!==true&&result.supplementalMissingCount===0&&
      result.knownScheduledIdsTruncated!==true&&
      Number(result.historyOnlyScheduledOutsideSearchCount||0)===0);
}

export function ownerInventoryForChannel(channelId:string,nowMs=Date.now()):OwnerYoutubeInventorySnapshot{
  const snapshot=readAuthoritativeExistingSnapshot(channelId);
  if(!snapshot)return{channelId,available:false,complete:false,total:0,public:0,private:0,scheduled:0,unlisted:0,published:0,publishedToday:0};
  return ownerInventoryFromVideos(channelId,snapshot.videos,snapshot.updatedAt,snapshot.syncInfo,nowMs)
}

export function aggregateOwnerInventories(channels:Channel[],nowMs=Date.now()):OwnerYoutubeInventoryTotals{
  const rows=channels.filter(c=>c.enabled!==false).map(c=>ownerInventoryForChannel(c.id,nowMs)).filter(x=>x.available);
  const future=rows.map(x=>x.nextScheduledAt).filter((x):x is string=>Boolean(x)).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return{
    availableChannels:rows.length,
    completeChannels:rows.filter(x=>x.complete).length,
    partialChannels:rows.filter(x=>!x.complete).length,
    total:rows.reduce((n,x)=>n+x.total,0),
    public:rows.reduce((n,x)=>n+x.public,0),
    private:rows.reduce((n,x)=>n+x.private,0),
    scheduled:rows.reduce((n,x)=>n+x.scheduled,0),
    unlisted:rows.reduce((n,x)=>n+x.unlisted,0),
    published:rows.reduce((n,x)=>n+x.published,0),
    publishedToday:rows.reduce((n,x)=>n+x.publishedToday,0),
    nextScheduledAt:future[0]
  }
}

export function ownerInventoryCacheStale(channelId:string,nowMs=Date.now(),ttlMs=OWNER_INVENTORY_TTL_MS){
  const cache=readExistingCache(channelId);
  const at=Date.parse(cache?.lastCompleteAt||cache?.updatedAt||'');
  return !Number.isFinite(at)||nowMs-at>=ttlMs
}

export type OwnerInventoryFleetStatus='UPDATED'|'PARTIAL_DATA'|'UNLINKED'|'MISMATCH'|'DUPLICATE'|'OAUTH_BLOCKED'|'API_FAILED'|'PERSISTENCE_FAILED'|'QUOTA_STOPPED'|'FRESH_CACHE';
export type OwnerInventoryRefreshRow={
  channelId:string;channelName:string;status:OwnerInventoryFleetStatus;
  profileId?:string;youtubeChannelId?:string;apiRequests:number;quotaUnits:number;error?:string;
  observedScheduled?:number;observedThrough?:string;diagnosticReasons?:string[];
};
export type OwnerInventoryRefreshSummary={
  requested:number;updated:number;failed:number;skippedFresh:number;skippedUnlinked:number;stoppedForQuota:boolean;
  apiRequests:number;quotaUnits:number;rows:OwnerInventoryRefreshRow[];
  searchCalls?:number;
  counts:Record<OwnerInventoryFleetStatus,number>;
  deepSearchChannels?:number;
  deepSearchFailedChannels?:number;
  deepSearchExhaustedChannels?:number;
  deepSearchPageLimitedChannels?:number;
  deepSearchSystemicStopCode?:string;
};
export type OwnerInventoryFleetProgress={done:number;total:number;channelName:string;status:OwnerInventoryFleetStatus};

// A successful but non-exhaustive YouTube response is not an API outage.
// Preserve a distinct PARTIAL_DATA status rather than implying HTTP failure.
export function classifyIncompleteOwnerCoverage(ownerMixed:boolean):OwnerInventoryFleetStatus{
  return ownerMixed?'API_FAILED':'PARTIAL_DATA';
}

// Never persist raw provider or OAuth exceptions from the native owner read.
// The displayed code is intentionally bounded to trusted method/status/reason enums.
export function safeOwnerInventoryFailureCode(error:unknown):string{
  const raw=String(error??'');
  const method=raw.match(/\bOWNER_INVENTORY_(?:CHANNELS_LIST|PLAYLIST_ITEMS_LIST|VIDEOS_LIST)_(?:NETWORK_ERROR|INVALID_JSON|HTTP_[0-9]{3}_(?:QUOTA_EXCEEDED|DAILY_LIMIT_EXCEEDED|RATE_LIMIT_EXCEEDED|INSUFFICIENT_PERMISSIONS|FORBIDDEN|UNAUTHORIZED|PLAYLIST_NOT_ACCESSIBLE|PLAYLIST_NOT_FOUND|CHANNEL_NOT_FOUND|VIDEO_NOT_FOUND|BACKEND_ERROR|INVALID_PARAMETER|OTHER))\b/);
  if(method)return method[0];
  const auth=raw.match(/\bOWNER_INVENTORY_AUTH_(?:INVALID_GRANT|CLIENT_MISMATCH|REFRESH_TOKEN_MISSING|KEYCHAIN_FAILURE|REFRESH_FAILED|AUTH_PREFLIGHT_FAILED)\b/);
  if(auth)return auth[0];
  const identity=raw.match(/\b(?:EXPECTED_CHANNEL_MISSING|OWNER_CHANNEL_MISSING|OWNER_CHANNEL_MISMATCH|OWNER_UPLOADS_MISSING|AUTHORITATIVE_CHANNEL_ID_MISMATCH)\b/);
  if(identity)return identity[0];
  // The previous version passed String(error) straight into the persisted
  // runway store; that could contain private Google error response text.
  return 'OWNER_INVENTORY_UNCLASSIFIED_ERROR';
}

const BLOCKED_OWNER_CREDENTIAL_STATES=new Set(['NEEDS_ONE_TIME_LOCAL_MIGRATION','CANONICAL_PRESENT_UNVERIFIED','CHECK_ON_USE','RECOVERABLE','KEYCHAIN_BLOCKED','RECONNECT_REQUIRED','MISSING','WRONG_CHANNEL','FAILED','KEYCHAIN_ERROR']);

function emptyOwnerCounts():Record<OwnerInventoryFleetStatus,number>{
  return{UPDATED:0,PARTIAL_DATA:0,UNLINKED:0,MISMATCH:0,DUPLICATE:0,OAUTH_BLOCKED:0,API_FAILED:0,PERSISTENCE_FAILED:0,QUOTA_STOPPED:0,FRESH_CACHE:0}
}
function duplicateExtraChannelIds(channels:Channel[],profiles:Awaited<ReturnType<typeof api.youtubeProfiles>>){
  const classification=classifyYoutubeChannels(channels,profiles),extras=new Set<string>();
  for(const duplicate of classification.duplicates){
    const ordered=duplicate.channelIds.slice().sort();
    for(const id of ordered.slice(1))extras.add(id)
  }
  return{classification,extras}
}
function pushOwnerRow(summary:OwnerInventoryRefreshSummary,row:OwnerInventoryRefreshRow){
  summary.rows.push(row);summary.counts[row.status]++;
  // One failed owner read must never turn a previously verified schedule into zero days.
  if(row.status==='API_FAILED'){
    markRunwayRefreshIssue({id:row.channelId,name:row.channelName},row.error==='AUTHORITATIVE_INVENTORY_INCOMPLETE'?'PARTIAL_DATA':'API_FAILED',row.error||'YouTube API failed');
  }else if(row.status==='UNLINKED'||row.status==='MISMATCH'||row.status==='OAUTH_BLOCKED'||row.status==='DUPLICATE'){
    markRunwayRefreshIssue({id:row.channelId,name:row.channelName},'AUTH_REQUIRED',row.error||row.status);
  }
  if(row.status==='UPDATED')summary.updated++;
  else if(row.status==='API_FAILED'||row.status==='PERSISTENCE_FAILED')summary.failed++;
  // Positive read-only videos.list evidence is usable as a lower bound, even
  // when exhaustive coverage is unproven. Do not count it as a confirmed update.
  else if(row.status==='PARTIAL_DATA')summary.failed++;
  else if(row.status==='FRESH_CACHE')summary.skippedFresh++;
  else if(row.status==='UNLINKED'||row.status==='MISMATCH'||row.status==='DUPLICATE'||row.status==='OAUTH_BLOCKED')summary.skippedUnlinked++;
}
export async function refreshOwnerInventoriesAuthoritative(
  channels:Channel[],
  force=false,
  suppliedProfiles?:Awaited<ReturnType<typeof api.youtubeProfiles>>,
  ownerKnownScheduledIds?:Record<string,string[]>,
  onProgress?:(progress:OwnerInventoryFleetProgress)=>void
):Promise<OwnerInventoryRefreshSummary>{
  const enabled=channels.filter(c=>c.enabled!==false);
  await hydrateExistingInventoryCaches(enabled.map(c=>c.id));
  const summary:OwnerInventoryRefreshSummary={requested:0,updated:0,failed:0,skippedFresh:0,skippedUnlinked:0,stoppedForQuota:false,apiRequests:0,quotaUnits:0,rows:[],counts:emptyOwnerCounts()};
  const profiles=suppliedProfiles||await api.youtubeProfiles();
  const {classification,extras}=duplicateExtraChannelIds(enabled,profiles);
  const unlinked=new Set([...classification.unlinked,...classification.orphans].map(c=>c.id));
  const mismatched=new Set(classification.mismatched.map(c=>c.id));
  const eligibleById=new Map(classification.eligible.map(x=>[x.channel.id,x]));
  let quotaStopped=false,fleetDeepSearches=0,systemicSearchFilterError:string|undefined;
  const report=(row:OwnerInventoryRefreshRow)=>{
    pushOwnerRow(summary,row);
    // Include every channel, including unlinked/quota-blocked, in progress.
    onProgress?.({done:summary.rows.length,total:enabled.length,channelName:row.channelName,status:row.status});
  };

  for(const channel of enabled){
    const linked=eligibleById.get(channel.id);
    if(extras.has(channel.id)){report({channelId:channel.id,channelName:channel.name,status:'DUPLICATE',profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,apiRequests:0,quotaUnits:0});continue}
    if(mismatched.has(channel.id)){report({channelId:channel.id,channelName:channel.name,status:'MISMATCH',profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,apiRequests:0,quotaUnits:0});continue}
    if(unlinked.has(channel.id)||!linked){report({channelId:channel.id,channelName:channel.name,status:'UNLINKED',profileId:channel.youtubeProfileId,youtubeChannelId:channel.youtubeChannelId,apiRequests:0,quotaUnits:0});continue}
    if(BLOCKED_OWNER_CREDENTIAL_STATES.has(String(linked.profile.credentialStatus||''))){
      report({channelId:channel.id,channelName:channel.name,status:'OAUTH_BLOCKED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests:0,quotaUnits:0,error:'credentialStatus='+String(linked.profile.credentialStatus||'UNKNOWN')});
      continue
    }
    if(!force&&(!ownerInventoryCacheStale(channel.id)||
      Date.now()-(ownerAttemptAt.get(channel.id)||0)<OWNER_INVENTORY_TTL_MS)){
      report({channelId:channel.id,channelName:channel.name,status:'FRESH_CACHE',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests:0,quotaUnits:0});
      continue
    }
    if(quotaStopped||youtubeQuotaState().blocked||Math.max(0,youtubeQuotaUsage().limit-youtubeQuotaUsage().used)<250){
      quotaStopped=true;summary.stoppedForQuota=true;
      report({channelId:channel.id,channelName:channel.name,status:'QUOTA_STOPPED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests:0,quotaUnits:0});
      continue
    }

    summary.requested++;
    const cached=ownerInventoryForChannel(channel.id),videoCount=cached.available?cached.total:50;
    const estimatedUnits=1+Math.max(1,Math.ceil(videoCount/50))+(videoCount?Math.ceil(videoCount/50):0);
    const operationId='owner-inventory:'+(force?'manual':'background')+':'+channel.id+':'+Date.now();
    bindYoutubeQuotaTraceContext(operationId,{reason:'OWNER_INVENTORY_REFRESH',channelIds:[channel.id],mode:force?'MANUAL':'BACKGROUND',estimatedUnits});
    try{
      const prior=readExistingCache(channel.id);
      const manualOne=force&&enabled.length===1;
      // The old "manualOne" restriction silently skipped deep Scheduled
      // verification for all 33 channels in a fleet refresh. Deep-check only
      // currently unverified channels, using the separate search bucket and a
      // hard per-run cap. Background refreshes remain zero-search.
      const stored=loadChannelRunwayStore().channels[channel.id];
      const unverified=!stored||stored.status==='no-data';
      const searchAvailable=youtubeQuotaBucketUsage('search').available;
      // Preserve the independent Search bucket reserve on every request.
      // Individual owner reconciliations may inspect more result pages, while
      // the full 33-channel audit stays bounded and cannot exhaust the bucket.
      const allowedSearchPages=force?Math.max(0,Math.min(manualOne?12:4,Math.floor(searchAvailable)-MANUAL_FLEET_SEARCH_MIN_AVAILABLE)):0;
      // A provider rejection of this query template is systemic, not
      // evidence that 33 individual channels need the same failed request.
      // Continue safe playlist/videos inventory, but stop repeating search.list.
      const targeted=force&&!systemicSearchFilterError&&allowedSearchPages>0&&
        Date.now()-(ownerSearchAt.get(channel.id)||0)>=OWNER_SEARCH_COOLDOWN_MS&&
        (manualOne||(unverified&&fleetDeepSearches<MANUAL_FLEET_DEEP_SEARCH_CHANNEL_CAP));
      // Reserve the fleet budget here, but do NOT count an actual Search
      // request until native confirms it attempted search.list.
      if(targeted)fleetDeepSearches++;
      const cachedRows=[...Object.values(prior?.baseline||{}),...(prior?.videos||[])];
      const cachedFuture=cachedRows
        .filter(v=>v.privacyStatus==='private'&&Boolean(v.publishAt)&&Date.parse(v.publishAt!)>Date.now())
        .sort((a,b)=>Date.parse(b.publishAt!)-Date.parse(a.publishAt!))
        .map(v=>v.id);
      // Recover private rows even if the prior snapshot lacked publishAt.
      // Remote videos.list is always authoritative for their current status.
      const cachedPrivate=cachedRows.filter(v=>v.privacyStatus==='private').map(v=>v.id);
      // Re-read owner-verified VYRON upload-history IDs even during a search
      // cooldown: no extra search.list call, no history mutation, no OAuth reset.
      const fromHistory=ownerKnownScheduledIds?.[channel.id]||[];
      // Recheck historical owner-known IDs on every inventory refresh, not
      // only manual scans. This costs cheap videos.list batches, never Search.
      const knownScheduledIds=[...new Set([...cachedFuture,...fromHistory,...cachedPrivate])]
        .filter(id=>/^[A-Za-z0-9_-]{11}$/.test(id));
      ownerAttemptAt.set(channel.id,Date.now());
      const result=await api.youtubeListExisting(linked.profile.id,5000,operationId,targeted,knownScheduledIds,targeted?allowedSearchPages:0);
      if(targeted&&result.searchUsed===true){
        summary.deepSearchChannels=(summary.deepSearchChannels||0)+1;
        ownerSearchAt.set(channel.id,Date.now());
        if(result.searchError)summary.deepSearchFailedChannels=(summary.deepSearchFailedChannels||0)+1;
        if(result.searchErrorCode==='OWNER_SEARCH_HTTP_400_INVALID_SEARCH_FILTER'||
           result.searchErrorCode==='OWNER_SEARCH_HTTP_400_INCOMPATIBLE_PARAMETERS'){
          systemicSearchFilterError=result.searchErrorCode;
          summary.deepSearchSystemicStopCode=result.searchErrorCode;
        }
        if(result.searchExhausted===true&&!result.searchError)
          summary.deepSearchExhaustedChannels=(summary.deepSearchExhaustedChannels||0)+1;
        if(result.searchExhausted!==true&&!result.searchError)
          summary.deepSearchPageLimitedChannels=(summary.deepSearchPageLimitedChannels||0)+1;
      }
      const backendApi=Number(result.fullSyncApiRequests),backendQuota=Number(result.fullSyncEstimatedQuotaCost);
      const fallback=!Number.isFinite(backendApi)||backendApi<1?youtubeOperationActualCost(operationId):null;
      const apiRequests=Number.isFinite(backendApi)&&backendApi>=1?backendApi:Object.values(fallback?.methods||{}).reduce((n:number,x:any)=>n+Number(x.calls||0),0);
      const quotaUnits=Number.isFinite(backendQuota)&&backendQuota>=0?backendQuota:Number(fallback?.buckets.general||apiRequests);
      summary.apiRequests+=apiRequests;summary.quotaUnits+=quotaUnits;
      summary.searchCalls=(summary.searchCalls||0)+Math.max(0,Number(result.searchCalls)||0);
      if(!result.channelId||String(result.channelId)!==String(linked.youtubeChannelId)){
        report({channelId:channel.id,channelName:channel.name,status:'API_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:'AUTHORITATIVE_CHANNEL_ID_MISMATCH'});
        continue
      }
      // Do not mutate the last verified native inventory from an incomplete scan.
      const ownerMixed=(result.videos||[]).some(v=>v.channelId&&v.channelId!==linked.youtubeChannelId);
      // A previously future Scheduled ID cannot vanish from a "complete"
      // replacement without an owner videos.list transition or explicit gap.
      // IDs returned as public/unlisted/private-without-future-publishAt are
      // reconciled; missing IDs remain unresolved, not silently deleted.
      const currentIds=new Set((result.videos||[]).map(v=>v.id));
      const unresolvedHistoricalIds=cachedFuture.filter(id=>!currentIds.has(id));
      const coverageOk=scheduledCoverageEstablished(result)&&scheduleSyncTruthFromInfo(result)==='complete'&&
        !ownerMixed&&unresolvedHistoricalIds.length===0;
      if(!coverageOk){
        const observed=ownerMixed?[]:(result.videos||[]).filter(v=>
          v.channelId===linked.youtubeChannelId&&v.privacyStatus==='private'&&
          Boolean(v.publishAt)&&Number.isFinite(Date.parse(v.publishAt!))&&Date.parse(v.publishAt!)>Date.now());
        const observedThrough=observed.map(v=>v.publishAt!).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
        const diagnosticReasons=Array.isArray(result.incompleteReasons)?result.incompleteReasons.slice(0,12):[];
        if(unresolvedHistoricalIds.length>0)diagnosticReasons.push('PREVIOUS_SCHEDULED_IDS_NOT_RECONCILED');
        if(result.scheduleComplete===true&&!scheduledCoverageEstablished(result))
          diagnosticReasons.push('INDEPENDENT_SCHEDULE_COVERAGE_NOT_VERIFIED');
        // Native Rust emits allowlisted diagnostic codes. Never persist raw
        // Google messages that could contain user or OAuth account metadata.
        if(result.searchErrorCode&&/^[A-Z][A-Z0-9_]*$/.test(result.searchErrorCode))
          diagnosticReasons.push(result.searchErrorCode);
        else if(result.searchError&&!diagnosticReasons.includes('OWNER_SEARCH_FAILED'))
          diagnosticReasons.push('OWNER_SEARCH_FAILED');
        if(result.searchUsed&&!result.searchExhausted&&!diagnosticReasons.includes('OWNER_SEARCH_NOT_EXHAUSTED'))
          diagnosticReasons.push('OWNER_SEARCH_NOT_EXHAUSTED');
        if(result.searchUsed&&result.searchExhausted&&!result.searchError&&!scheduledCoverageEstablished(result)&&
          !diagnosticReasons.includes('INDEPENDENT_SCHEDULE_COVERAGE_NOT_VERIFIED'))
          diagnosticReasons.push('INDEPENDENT_SCHEDULE_COVERAGE_NOT_VERIFIED');
        const reason=ownerMixed?'AUTHORITATIVE_VIDEO_CHANNEL_MISMATCH':'AUTHORITATIVE_INVENTORY_INCOMPLETE';
        // Distinguish a real API failure from a partial, verified-positive owner
        // inventory. Never promote search snippets or non-owner rows to proof.
        // A complete owner-scoped uploads/videos.list read can still lack proof of
        // *Scheduled coverage*. That is incomplete evidence, not an HTTP/API
        // failure: show PARTIAL_DATA rather than a misleading API_FAILED toast.
        // Actual incomplete hydration and channel-ownership mismatches remain failures.
        // A successful owner-scoped API response with incomplete coverage is
        // PARTIAL_DATA even when zero future videos were found. Absence of a
        // Scheduled result is NOT an HTTP/API failure and NOT a confirmed zero.
        // Only an actual exception, wrong owner Channel ID or cross-owner
        // video evidence may be classified API_FAILED.
        const status=classifyIncompleteOwnerCoverage(ownerMixed);
        report({channelId:channel.id,channelName:channel.name,status,profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:reason,
          observedScheduled:observed.length,observedThrough,diagnosticReasons});
        // Preserve verified-positive Scheduled rows in Runway as LOWER-BOUND
        // evidence only; neither SQLite baseline nor last verified sync is overwritten.
        if(!ownerMixed){
          // Persist only static diagnostic codes; provider error text may include
          // account context and must never be written into UI diagnostics.
          const safeCodes=diagnosticReasons.filter(x=>/^[A-Z][A-Z0-9_]*$/.test(x)).slice(0,12);
          markRunwayRefreshIssue(channel,'PARTIAL_DATA',[reason,...safeCodes].join(' | '),new Date(),undefined,observed);
        }
        continue
      }
      const cache=await replaceExistingCacheFromSync(channel.id,result.videos||[],result);
      if(!cache.persisted){
        report({channelId:channel.id,channelName:channel.name,status:'PERSISTENCE_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:`Данные YouTube получены, но VYRON не смог сохранить их локально. API повторно не запускайте. Ошибка: ${cache.persistErrorCode||'STORAGE_WRITE_FAILED'}`});
        continue
      }
      markYoutubeCache('existing',channel.id);
      const now=new Date(),expected=deriveRunwayRecord(channel,result.videos||[],now,now.toISOString(),true);
      const runwayWrite=upsertChannelRunwayFromYoutube(channel,result.videos||[],now);
      const persisted=loadChannelRunwayStore().channels[channel.id];
      const readbackOk=runwayWrite.ok&&Boolean(persisted)&&persisted.channelId===channel.id&&Boolean(persisted.lastScheduleSync)&&persisted.scheduledVideoCount===expected.scheduledVideoCount&&persisted.scheduledUntil===expected.scheduledUntil;
      if(!readbackOk){
        report({channelId:channel.id,channelName:channel.name,status:'PERSISTENCE_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:`Данные YouTube получены, но VYRON не смог сохранить их локально. API повторно не запускайте. Ошибка: ${runwayWrite.errorCode||'STORAGE_READBACK_FAILED'}`});
        continue
      }
      report({channelId:channel.id,channelName:channel.name,status:'UPDATED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits});
    }catch(error){
      const actual=youtubeOperationActualCost(operationId),apiRequests=Object.values(actual.methods).reduce((n,x)=>n+x.calls,0),quotaUnits=actual.buckets.general;
      summary.apiRequests+=apiRequests;summary.quotaUnits+=quotaUnits;
      report({channelId:channel.id,channelName:channel.name,status:'API_FAILED',profileId:linked.profile.id,youtubeChannelId:linked.youtubeChannelId,apiRequests,quotaUnits,error:safeOwnerInventoryFailureCode(error)});
    }
  }
  if(summary.rows.length!==enabled.length){
    throw new Error(`OWNER_FLEET_INCOMPLETE: checked ${summary.rows.length} of ${enabled.length}`);
  }
  if(typeof window!=='undefined')window.dispatchEvent(new CustomEvent(OWNER_INVENTORY_EVENT,{detail:summary}));
  return summary
}

export function refreshStaleOwnerInventories(channels:Channel[],force=false):Promise<OwnerInventoryRefreshSummary>{
  const ids=channels.filter(c=>c.enabled!==false).map(c=>c.id).sort();
  const runKey=(force?'force:':'stale:')+ids.join('|');
  const existing=ownerInventoryRuns.get(runKey);
  if(existing)return existing;
  const task=refreshOwnerInventoriesAuthoritative(channels,force);
  ownerInventoryRuns.set(runKey,task);
  void task.finally(()=>{if(ownerInventoryRuns.get(runKey)===task)ownerInventoryRuns.delete(runKey)});
  return task;
}


/**
 * VYRON 6.1.25 one-shot owner verification for the eight P0 discrepant channels.
 * This is a STRICT LOWER BOUND: known IDs cannot prove that Search indexed all
 * private future uploads. No playlist/Search request, mutation or OAuth export.
 * Only the current VYRON process touches its existing owner OAuth vault.
 */
const P0_OWNER_CHANNEL_NAMES=new Set([
  'Glass City Lovers','Midnight Noir Lounge','Neon Drive FM','Mafia 1947 Lounge',
  'Afterglow Highway','Rain & Roast Jazz','珈琲小路','After Dark Voice'
]);
const P0_LOCAL_EVIDENCE_PREFIX='vyron:p0-owner-evidence:625:';
const P0_MAX_GENERAL_CALLS=20;
const P0_GENERAL_RESERVE=200;
const P0_RETRY_COOLDOWN_MS=6*60*60*1000;

export type P0OwnerEvidence={
  channelId:string;ownerChannelId:string;verifiedAt:string;status:'PARTIAL_DATA'|'OWNER_VERIFICATION_FAILED';
  knownIds:number;hydratedIds:number;confirmedFutureScheduled:number;
  latestVerifiedPublishAt?:string;notReturned:number;
  generalCalls:number;searchCalls:0;coverage:'KNOWN_IDS_ONLY';
  transitions:Array<{videoId:string;transition:'STILL_SCHEDULED'|'PUBLISHED'|'STATUS_CHANGED'|'NOT_RETURNED';currentPublishAt?:string}>;
};
export async function runP0OwnerKnownIdsReadOnly(
  channels:Channel[],
  profiles:Awaited<ReturnType<typeof api.youtubeProfiles>>,
  history:Parameters<typeof knownOwnerVideoIdsFromUploadHistory>[0],
  shouldStop:()=>boolean=()=>false,
  nowMs=Date.now()
):Promise<P0OwnerEvidence[]>{
  const byProfile=new Map(profiles.map(p=>[p.id,p]));
  const targets=channels.filter(c=>c.enabled!==false&&P0_OWNER_CHANNEL_NAMES.has(c.name));
  await hydrateExistingInventoryCaches(targets.map(c=>c.id));
  const results:P0OwnerEvidence[]=[];
  let callsBudget=P0_MAX_GENERAL_CALLS;
  for(const channel of targets){
    if(shouldStop())break;
    const profile=channel.youtubeProfileId?byProfile.get(channel.youtubeProfileId):undefined;
    if(!profile||!channel.youtubeChannelId||
       String(profile.channelId)!==String(channel.youtubeChannelId)||
       BLOCKED_OWNER_CREDENTIAL_STATES.has(String(profile.credentialStatus||'')))continue;
    const key=P0_LOCAL_EVIDENCE_PREFIX+channel.id;
    let previous:{attemptAt?:string;result?:P0OwnerEvidence}|undefined;
    try{previous=JSON.parse(localStorage.getItem(key)||'null')}catch{}
    if(previous?.result?.status==='PARTIAL_DATA'&&
       nowMs-Date.parse(previous.result.verifiedAt)<P0_RETRY_COOLDOWN_MS){
      results.push(previous.result);continue;
    }
    if(previous?.attemptAt&&nowMs-Date.parse(previous.attemptAt)<P0_RETRY_COOLDOWN_MS)continue;
    const native=readExistingCache(channel.id);
    const priorRows=[...Object.values(native?.baseline||{}),...(native?.videos||[])];
    const fromHistory=knownOwnerVideoIdsFromUploadHistory(history,channel,nowMs);
    // Full known-set read (including historically scheduled IDs now in the past)
    // avoids hiding old transitions behind the latest uploads playlist.
    const ids=[...new Set([...priorRows.map(x=>x.id),...fromHistory])]
      .filter(x=>/^[A-Za-z0-9_-]{11}$/.test(x));
    if(ids.length===0)continue;
    const needed=Math.ceil(ids.length/50);
    if(youtubeQuotaState().blocked||needed>callsBudget||
       needed>Math.max(0,youtubeQuotaBucketUsage('general').available-P0_GENERAL_RESERVE))
      continue;
    // Reserve a hard local session budget; never ask for Search or a full refresh.
    callsBudget-=needed;
    const attemptedAt=new Date().toISOString();
    try{localStorage.setItem(key,JSON.stringify({attemptAt:attemptedAt}))}catch{continue}
    const operationId='owner-known-ids-p0-625:'+channel.id+':'+Date.now();
    bindYoutubeQuotaTraceContext(operationId,{
      reason:'OWNER_P0_KNOWN_IDS_READONLY',channelIds:[channel.id],
      mode:'MANUAL',estimatedUnits:needed
    });
    try{
      const response=await api.youtubeRetryExistingHydration(profile.id,ids,operationId);
      const ownerRows=(response.videos||[]).filter(v=>v.channelId===channel.youtubeChannelId);
      const byId=new Map(ownerRows.map(v=>[v.id,v]));
      const transitions:P0OwnerEvidence['transitions']=ids.map(id=>{
        const fresh=byId.get(id);
        const published=fresh?.privacyStatus==='public'||fresh?.privacyStatus==='unlisted';
        const future=fresh?.privacyStatus==='private'&&isFuture(fresh.publishAt,Date.now());
        const transition=!fresh?'NOT_RETURNED':future?'STILL_SCHEDULED':published?'PUBLISHED':'STATUS_CHANGED';
        return{videoId:id,transition,currentPublishAt:fresh?.publishAt}
      });
      const future=ownerRows.filter(v=>v.privacyStatus==='private'&&isFuture(v.publishAt,Date.now()));
      const latest=future.map(x=>x.publishAt!).sort((a,b)=>Date.parse(a)-Date.parse(b)).at(-1);
      // Targeted videos.list establishes a fresh minimum, NEVER an exhaustive
      // schedule. Keep the previous complete inventory and historical Runway.
      const evidence:P0OwnerEvidence={
        channelId:channel.id,ownerChannelId:channel.youtubeChannelId,verifiedAt:new Date().toISOString(),
        status:'PARTIAL_DATA',knownIds:ids.length,hydratedIds:ownerRows.length,
        confirmedFutureScheduled:future.length,latestVerifiedPublishAt:latest,
        notReturned:transitions.filter(x=>x.transition==='NOT_RETURNED').length,
        generalCalls:Math.max(0,Number(response.apiRequests)||0),searchCalls:0,
        coverage:'KNOWN_IDS_ONLY',transitions
      };
      try{localStorage.setItem(key,JSON.stringify({attemptAt:attemptedAt,result:evidence}))}catch{}
      markRunwayRefreshIssue(channel,'PARTIAL_DATA','OWNER_KNOWN_ID_VERIFIED_SEARCH_COVERAGE_UNPROVEN',new Date(),undefined,ownerRows);
      results.push(evidence);
    }catch{
      // No raw provider/OAuth error is persisted. In particular, no result
      // may replace the previously verified baseline on a failed request.
      try{localStorage.setItem(key,JSON.stringify({attemptAt:attemptedAt,errorCode:'OWNER_P0_VERIFICATION_FAILED'}))}catch{}
    }
  }
  return results;
}
