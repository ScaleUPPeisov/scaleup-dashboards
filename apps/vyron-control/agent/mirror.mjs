import { createHash } from 'node:crypto';
import {
  appendFile, chmod, mkdir, readFile, rename, stat, statfs, writeFile
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { arch, cpus, freemem, homedir, totalmem, uptime } from 'node:os';

// Read-only adapter for VYRON's EXISTING local state mirror written by
// src-tauri/src/storage.rs at ~/Documents/VYRON/State/app-state.json.
// No OAuth/Keychain access or mutation of VYRON.
const VALID_CHANNEL = /^UC[A-Za-z0-9_-]{22}$/;
const MAP = Object.freeze({
  UPLOAD_QUEUED: 'upload_queued',
  UPLOAD_STARTED: 'upload_started',
  UPLOAD_PROGRESS: 'upload_progress',
  UPLOAD_ACCEPTED: 'upload_completed',
  UPLOAD_FAILED: 'upload_failed',
  RENDER_COMPLETED: 'render_completed',
  PRODUCTION_BUILD_STARTED: 'agent_info',
  PRODUCTION_BUILD_COMPLETED: 'agent_info',
  PRODUCTION_BUILD_FAILED: 'agent_error',
  SCHEDULE_UPDATED: 'schedule_changed',
  CHANNEL_STATS_REFRESH: 'channel_sync',
  STATS_REFRESH_BATCH: 'channel_sync',
  OAUTH_KEYCHAIN_ACCESS_DENIED: 'agent_error',
  OAUTH_PROFILE_RECONNECT_REQUIRED: 'agent_error',
  ANALYTICS_EXPORT_FAILED: 'agent_error',
  ANALYTICS_EXPORT_COMPLETED: 'agent_info',
  YOUTUBE_READY: 'agent_info',
  YOUTUBE_PROCESSING: 'agent_info',
  SOURCE_MISSING: 'agent_error',
  SOURCE_RECOVERED: 'agent_info'
});
const MAX_SEEN = 20000;
const MAX_IMPORT_PER_TICK = 1000;
const ERROR_EVENT_TYPES = new Set([
  'UPLOAD_FAILED','RENDER_FAILED','PRODUCTION_BUILD_FAILED',
  'OAUTH_KEYCHAIN_ACCESS_DENIED','OAUTH_PROFILE_RECONNECT_REQUIRED',
  'ANALYTICS_EXPORT_FAILED','SOURCE_MISSING'
]);
const TELEMETRY_FIELDS = Object.freeze([
  'vyronVersion','endlumeVersion','macOSVersion','macModel','architecture',
  'uptimeSeconds','memoryTotalBytes','memoryFreeBytes',
  'rootDiskTotalBytes','rootDiskFreeBytes','diskOnline'
]);
const GIB = 1024 ** 3;

function plistString(source,key) {
  if(typeof source!=='string')return null;
  const marker='<key>'+key+'</key>';
  const at=source.indexOf(marker);
  if(at<0)return null;
  const rest=source.slice(at+marker.length).trimStart();
  if(!rest.startsWith('<string>'))return null;
  const end=rest.indexOf('</string>');
  return end>8?rest.slice(8,end).trim()||null:null;
}

async function appBundleVersion(names,overridePath) {
  const candidates=[];
  if(typeof overridePath==='string'&&overridePath.trim())candidates.push(overridePath.trim());
  else for(const root of ['/Applications',join(homedir(),'Applications')])
    for(const name of names)candidates.push(join(root,name+'.app'));
  for(const candidate of candidates) {
    const infoPath=candidate.endsWith('/Info.plist')
      ?candidate:join(candidate,'Contents','Info.plist');
    try {
      const plist=await readFile(infoPath,'utf8');
      const version=plistString(plist,'CFBundleShortVersionString')||
        plistString(plist,'CFBundleVersion');
      if(version)return version.slice(0,80);
    } catch { /* App is not installed at this candidate path. */ }
  }
  return null;
}

function configuredExternalVolumes(state) {
  const volumes=new Set();
  const seen=new Set();
  const add=value=>{
    if(typeof value!=='string'||!value.startsWith('/Volumes/'))return;
    const name=value.slice('/Volumes/'.length).split('/')[0];
    if(name)volumes.add(join('/Volumes',name));
  };
  const visit=(value,depth=0)=>{
    if(depth>5||!value||typeof value!=='object'||seen.has(value))return;
    seen.add(value);
    if(Array.isArray(value)) {
      for(const item of value.slice(0,500))visit(item,depth+1);
      return;
    }
    for(const item of Object.values(value).slice(0,300)) {
      if(typeof item==='string')add(item);
      else if(item&&typeof item==='object')visit(item,depth+1);
    }
  };
  visit(state?.settings);
  visit(state?.jobs);
  visit(state?.channels);
  add(process.env.VYRON_AGENT_EXTERNAL_VOLUME_PATH);
  return [...volumes];
}

async function externalDiskOnline(state) {
  const volumes=configuredExternalVolumes(state);
  if(!volumes.length)return null;
  const mounted=await Promise.all(volumes.map(async volume=>{
    try {await stat(volume);return true;}
    catch(error){return error?.code==='ENOENT'?false:null;}
  }));
  if(mounted.some(value=>value===false))return false;
  return mounted.every(value=>value===true)?true:null;
}

export async function collectHostTelemetry(state) {
  if(process.platform!=='darwin')return {};
  const [vyronVersion,endlumeVersion,systemPlist,rootFs,diskOnline]=await Promise.all([
    appBundleVersion(['VYRON','Vyron','VYRON CONTROL','ChannelFlow'],
      process.env.VYRON_AGENT_VYRON_APP_PATH),
    appBundleVersion(['ENDLUME','Endlume','ENDLUME Renderer'],
      process.env.VYRON_AGENT_ENDLUME_APP_PATH),
    readFile('/System/Library/CoreServices/SystemVersion.plist','utf8').catch(()=>null),
    statfs('/').catch(()=>null),
    externalDiskOnline(state)
  ]);
  const model=cpus()[0]?.model;
  const telemetry={
    architecture:arch(),
    uptimeSeconds:Math.max(0,Math.floor(uptime())),
    memoryTotalBytes:totalmem(),
    memoryFreeBytes:freemem(),
    diskOnline
  };
  const macOSVersion=plistString(systemPlist,'ProductVersion');
  if(macOSVersion)telemetry.macOSVersion=macOSVersion;
  if(model)telemetry.macModel=String(model).slice(0,120);
  if(vyronVersion)telemetry.vyronVersion=vyronVersion;
  if(endlumeVersion)telemetry.endlumeVersion=endlumeVersion;
  if(rootFs) {
    const total=Math.floor(rootFs.blocks*rootFs.bsize);
    const free=Math.floor(rootFs.bavail*rootFs.bsize);
    if(Number.isSafeInteger(total)&&total>=0)telemetry.rootDiskTotalBytes=total;
    if(Number.isSafeInteger(free)&&free>=0)telemetry.rootDiskFreeBytes=free;
  }
  return telemetry;
}

function telemetryFingerprint(telemetry={}) {
  const wholeGiB=value=>Number.isSafeInteger(value)?Math.floor(value/GIB):null;
  return JSON.stringify({
    vyronVersion:telemetry.vyronVersion||null,
    endlumeVersion:telemetry.endlumeVersion||null,
    macOSVersion:telemetry.macOSVersion||null,
    macModel:telemetry.macModel||null,
    architecture:telemetry.architecture||null,
    diskOnline:typeof telemetry.diskOnline==='boolean'?telemetry.diskOnline:null,
    uptimeBucket:Number.isSafeInteger(telemetry.uptimeSeconds)
      ?Math.floor(telemetry.uptimeSeconds/300):null,
    memoryFreeGiB:wholeGiB(telemetry.memoryFreeBytes),
    rootDiskFreeGiB:wholeGiB(telemetry.rootDiskFreeBytes)
  });
}

function channelIdFrom(row) {
  const candidate = row?.youtubeChannelId || row?.stats?.channelId;
  return typeof candidate === 'string' && VALID_CHANNEL.test(candidate)
    ? candidate : null;
}
export function mirrorChannels(state) {
  const channels = Array.isArray(state?.channels) ? state.channels : [];
  const known = new Map();
  for (const row of channels) {
    const id = channelIdFrom(row);
    if (!id) continue;
    const name = String(row?.name || row?.stats?.channelTitle || id).slice(0,120);
    if (!known.has(id)) {
      const profileId=typeof row?.youtubeProfileId==='string'?row.youtubeProfileId.trim():'';
      // Send only a one-way fingerprint, never the local OAuth profile ID or credentials.
      const profileBinding=profileId&&profileId.length<=160
        ?createHash('sha256').update('vyron-profile-binding-v1\\0'+profileId).digest('hex')
        :null;
      known.set(id,{id,name,...(profileBinding?{profileBinding}:{})});
    }
  }
  return [...known.values()];
}

// A user's requested daily report uses Krasnoyarsk's calendar day,
// regardless of the Mac's own time zone.
function krasnoyarskDay(input) {
  const at=new Date(input);
  if(!Number.isFinite(at.getTime())) return null;
  const parts=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Krasnoyarsk',year:'numeric',month:'2-digit',day:'2-digit'
  }).formatToParts(at);
  const p=Object.fromEntries(parts.map(({type,value})=>[type,value]));
  return `${p.year}-${p.month}-${p.day}`;
}
export function mirrorStatus(state,now=new Date(),telemetry={}) {
  const jobs = Array.isArray(state?.jobs) ? state.jobs : [];
  const uploaded = Array.isArray(state?.uploadHistory) ? state.uploadHistory : [];
  const journal = Array.isArray(state?.activityJournal) ? state.activityJournal : [];
  const channels = Array.isArray(state?.channels) ? state.channels : [];
  const today = krasnoyarskDay(now);
  const inToday = timestamp => Boolean(today) && krasnoyarskDay(timestamp)===today;
  const latestError=journal.filter(row=>ERROR_EVENT_TYPES.has(row?.eventType)&&
    Number.isFinite(Date.parse(row?.timestamp)))
    .sort((a,b)=>Date.parse(a.timestamp)-Date.parse(b.timestamp)).at(-1);
  const rawError=String(latestError?.errorCode||latestError?.eventType||'');
  const lastError=/^[A-Za-z0-9_-]{1,150}$/.test(rawError)?rawError:
    latestError?'AGENT_ERROR':null;
  const system={};
  for(const key of TELEMETRY_FIELDS) {
    const value=telemetry?.[key];
    if(typeof value==='boolean'||
      (Number.isSafeInteger(value)&&value>=0)||
      (typeof value==='string'&&value.length<=150))system[key]=value;
  }
  return {
    macAwake: true,
    channelsTotal: channels.length,
    channelsBound: mirrorChannels(state).length,
    rendersActive: jobs.filter(x => x?.status === 'RENDERING').length,
    jobsReadyUpload: jobs.filter(x => x?.status === 'READY_UPLOAD').length,
    uploadsQueued: jobs.filter(x => x?.status === 'READY_UPLOAD' || x?.status === 'UPLOADING').length,
    uploadsCompleted: uploaded.filter(x => x?.status === 'UPLOADED').length,
    uploadsToday: uploaded.filter(x => x?.status === 'UPLOADED' && inToday(x?.uploadedAt)).length,
    rendersCompletedToday: journal.filter(x =>
      x?.eventType === 'RENDER_COMPLETED' && inToday(x.timestamp)).length,
    uploadFailuresToday: journal.filter(x =>
      x?.eventType === 'UPLOAD_FAILED' && inToday(x.timestamp)).length,
    syncCursor: 'mirror-v2',
    ...system,
    ...(lastError?{lastError}:{})
  };
}

export function mirrorAnalytics(state) {
  const channels=Array.isArray(state?.channels)?state.channels:[];
  return channels.flatMap(channel=>{
    const id=channelIdFrom(channel),a=channel?.analytics;
    if(!id || !a || typeof a!=='object')return [];
    const days=Number(a.periodDays);
    if(!Number.isSafeInteger(days)||days<1||days>365)return [];
    const captured=Date.parse(a.updatedAt);
    if(!Number.isFinite(captured))return [];
    const numeric=(v)=>{
      if(v===undefined||v===null)return null;
      const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
    };
    const result={
      channelId:id,periodDays:days,capturedAt:new Date(captured).toISOString(),
      views:numeric(a.views),watchMinutes:numeric(a.watchMinutes),
      avgViewSeconds:numeric(a.averageViewDuration),
      avgViewPercentage:numeric(a.averageViewPercentage),
      subscribersGained:numeric(a.subscribersGained),
      subscribersLost:numeric(a.subscribersLost),
      impressions:numeric(a.impressions),impressionCtr:numeric(a.impressionCtr),
      monetaryAuthorized:a.monetaryAuthorized===true,
      estimatedRevenue:a.monetaryAuthorized===true?numeric(a.estimatedRevenue):null,
      daily:Array.isArray(a.daily)?a.daily.slice(-90).flatMap(row=>{
        if(!/^\d{4}-\d{2}-\d{2}$/.test(row?.date||''))return [];
        return [{date:row.date,views:numeric(row.views),
          watchMinutes:numeric(row.watchMinutes),
          subscribersGained:numeric(row.subscribersGained),
          subscribersLost:numeric(row.subscribersLost)}];
      }):[]
    };
    return [result];
  });
}

export function mirrorEvents(state) {
  const channels = Array.isArray(state?.channels) ? state.channels : [];
  const maps = new Map(channels.map(c => [c?.id,channelIdFrom(c)]));
  const names = new Map(channels.map(c => [c?.id,String(c?.name || 'Канал').slice(0,100)]));
  const journal = Array.isArray(state?.activityJournal) ? state.activityJournal : [];
  const events=[];
  for (const row of journal) {
    const kind = MAP[row?.eventType];
    if (!kind || !row?.eventId || !row?.timestamp) continue;
    const time = Date.parse(row.timestamp);
    if (!Number.isFinite(time)) continue;
    const hash=createHash('sha256').update(String(row.eventId)).digest('hex').slice(0,32);
    const channelId = maps.get(row.channelId) || undefined;
    const title = [String(row.eventType).replaceAll('_',' '),names.get(row.channelId)]
      .filter(Boolean).join(' · ').slice(0,160);
    const payload = {};
    // Strict allowlist. Never forward details, localSourcePath, credentials,
    // metadata, uploader tokens, Google profile IDs or file paths.
    if (typeof row.jobId === 'string' && /^[A-Za-z0-9_-]{1,150}$/.test(row.jobId)) {
      payload.projectId=row.jobId.slice(0,150);
    }
    if (typeof row.errorCode === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(row.errorCode)) {
      payload.errorCode=row.errorCode;
    }
    const percent = row?.details?.percent;
    if (typeof percent==='number' && Number.isFinite(percent) && percent>=0 && percent<=100)
      payload.percent=Math.round(percent);
    events.push({
      id:'evt_'+hash,kind,title,occurredAt:new Date(time).toISOString(),
      ...(channelId?{channelId}:{}),payload
    });
  }
  return events;
}

async function privateJson(path,data) {
  await mkdir(dirname(path),{recursive:true,mode:0o700});
  const temp=path+'.tmp-'+process.pid;
  await writeFile(temp,JSON.stringify(data),{flag:'w',mode:0o600});
  await chmod(temp,0o600);
  await rename(temp,path);
}

export class MirrorExport {
  constructor({
    mirrorFile=join(homedir(),'Documents','VYRON','State','app-state.json'),
    outDir=join(homedir(),'.vyron-control-agent'),now=()=>new Date(),
    collectTelemetry=collectHostTelemetry
  }={}) {
    this.now=now;
    this.collectTelemetry=collectTelemetry;
    this.mirrorFile=mirrorFile;
    this.outDir=outDir;
    this.eventsFile=join(outDir,'events.jsonl');
    this.channelsFile=join(outDir,'channels.json');
    this.statusFile=join(outDir,'status.json');
    this.analyticsFile=join(outDir,'analytics.json');
    this.cursorFile=join(outDir,'mirror-seen.json');
    this.seen=new Set();
    this.initialized=false;
    this.lastSignature='';
  }
  async initialize() {
    await mkdir(this.outDir,{recursive:true,mode:0o700});
    await chmod(this.outDir,0o700);
    try {
      const parsed=JSON.parse(await readFile(this.cursorFile,'utf8'));
      if (Array.isArray(parsed.ids)) this.seen=new Set(parsed.ids.slice(-MAX_SEEN));
    } catch(error){if(error.code!=='ENOENT')throw error;}
    this.initialized=true;
  }
  async refresh() {
    if(!this.initialized)throw new Error('MirrorExport.initialize must run first');
    let file;
    try{file=await stat(this.mirrorFile);}
    catch(error){if(error.code==='ENOENT')return {status:'mirror_missing',events:0};throw error;}
    const instant=this.now();
    const state=JSON.parse(await readFile(this.mirrorFile,'utf8'));
    if (!state || !Array.isArray(state.channels) || !Array.isArray(state.jobs))
      throw new Error('Invalid VYRON state mirror, refusing to export');
    const telemetry=await this.collectTelemetry(state);
    const signature=file.mtimeMs+':'+file.size+':'+krasnoyarskDay(instant)+
      ':'+telemetryFingerprint(telemetry);
    if(signature===this.lastSignature) return {status:'unchanged',events:0};
    const channels=mirrorChannels(state);
    const status=mirrorStatus(state,instant,telemetry);
    const analytics=mirrorAnalytics(state);
    await privateJson(this.channelsFile,channels);
    await privateJson(this.statusFile,status);
    await privateJson(this.analyticsFile,analytics);
    const all=mirrorEvents(state);
    // The first start imports the most recent history rather than flooding
    // a free-tier Worker with years of old journal rows.
    const limit=this.seen.size===0 ? 1000 : MAX_IMPORT_PER_TICK;
    const pending=all.filter(e=>!this.seen.has(e.id)).slice(-limit);
    if(pending.length) {
      await appendFile(this.eventsFile,pending.map(e=>JSON.stringify(e)).join('\n')+'\n',
        {mode:0o600});
      await chmod(this.eventsFile,0o600);
      for(const event of pending)this.seen.add(event.id);
      const ids=[...this.seen].slice(-MAX_SEEN);
      await privateJson(this.cursorFile,{ids});
      this.seen=new Set(ids);
    }
    this.lastSignature=signature;
    return {status:'exported',events:pending.length,channels:channels.length,analytics:analytics.length};
  }
}
