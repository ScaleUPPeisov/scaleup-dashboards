import { open, readFile, stat, mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { cleanEvent,cleanStatus,checkRemoteCommand } from './logic.mjs';
import { validatedChannelList } from '../cloudflare/src/core.mjs';
import { createHash } from 'node:crypto';

export class MacBridge {
  constructor({ url, token, deviceId='macbook_m1', eventsFile=null,
      statusFile=null, channelsFile=null, analyticsFile=null, cursorFile=join(homedir(),'.vyron-control-agent','cursor.json'),
      fetchImpl=fetch }) {
    if (!/^https:\/\//.test(url) || !/^.{32,}$/.test(token))
      throw new Error('HTTPS URL and secure 32+ character agent token required');
    if (!/^[A-Za-z0-9_-]{3,50}$/.test(deviceId)) throw new Error('Invalid deviceId');
    this.url=url.replace(/\/$/,'');
    this.token=token;this.deviceId=deviceId;this.eventsFile=eventsFile;
    this.statusFile=statusFile;this.channelsFile=channelsFile;this.analyticsFile=analyticsFile;this.cursorFile=cursorFile;this.fetchImpl=fetchImpl;
    this.offset=0;this.busy=false;this.lastChannelHash=null;this.lastChannelSyncAttemptAt=0;this.lastAnalyticsHash=null;
  }
  async initialize() {
    try {
      const position=JSON.parse(await readFile(this.cursorFile,'utf8'));
      if (Number.isSafeInteger(position.offset)&&position.offset>=0)this.offset=position.offset;
    } catch(error) {if(error.code!=='ENOENT') throw error;}
  }
  async api(path,method='GET',body=undefined) {
    const response=await this.fetchImpl(this.url+path,{
      method,headers:{Authorization:'Bearer '+this.token,
        'Content-Type':'application/json'},
      body:body==null?undefined:JSON.stringify(body),
      signal:AbortSignal.timeout(12000)
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(`Cloud HTTP ${response.status}`);
    return result;
  }
  async readStatus() {
    if (!this.statusFile) return cleanStatus({});
    try {
      const data=JSON.parse(await readFile(this.statusFile,'utf8'));
      return cleanStatus(data);
    } catch(e) {
      if(e.code==='ENOENT') return cleanStatus({});
      throw e;
    }
  }
  async heartbeat() {
    return this.api('/api/agent/heartbeat','POST',{
      deviceId:this.deviceId,label:'VYRON / ENDLUME Mac',
      status:await this.readStatus()
    });
  }
  async syncChannelRegistry() {
    if (!this.channelsFile) return { imported:0, reason:'no_export' };
    let raw;
    try {raw=JSON.parse(await readFile(this.channelsFile,'utf8'));}
    catch(error) {
      if(error.code==='ENOENT') return {imported:0, reason:'export_missing'};
      throw error;
    }
    const entries=Array.isArray(raw)?raw:raw?.channels;
    if (!Array.isArray(entries)) throw new Error('Expected channel export array');
    const byId=new Map(entries.map(ch=>[String(ch.id??ch.channelId??''),ch]));
    const normalized=validatedChannelList(entries.map(ch=>({
      id:ch.id ?? ch.channelId,
      name:ch.name ?? ch.title
    }))).map(channel=>{
      const source=byId.get(channel.id);
      const binding=String(source?.profileBinding||'');
      return /^[a-f0-9]{64}$/i.test(binding)
        ?{...channel,profileBinding:binding.toLowerCase()}:channel;
    });
    if (!normalized.length) return { imported:0, reason:'empty_export' };
    const hash=createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    if (hash===this.lastChannelHash) return {imported:0, reason:'unchanged'};
    if(Date.now()-this.lastChannelSyncAttemptAt<120_000)
      return {imported:0,reason:'retry_backoff'};
    this.lastChannelSyncAttemptAt=Date.now();
    const result=await this.api('/api/agent/channels','POST',normalized);
    if(result.publicSync?.complete===false)
      return {imported:0,reason:'initial_sync_pending',publicSync:result.publicSync};
    this.lastChannelHash=hash;
    return {imported:normalized.length,result};
  }
  async syncAnalytics() {
    if(!this.analyticsFile)return {uploaded:0,reason:'no_export'};
    let raw;
    try{raw=JSON.parse(await readFile(this.analyticsFile,'utf8'));}
    catch(error){
      if(error.code==='ENOENT')return {uploaded:0,reason:'export_missing'};
      throw error;
    }
    if(!Array.isArray(raw)||raw.length>100)throw new Error('Invalid analytics export');
    if(!raw.length)return {uploaded:0,reason:'empty_export'};
    const hash=createHash('sha256').update(JSON.stringify(raw)).digest('hex');
    if(hash===this.lastAnalyticsHash)return {uploaded:0,reason:'unchanged'};
    // Each chunk is independently idempotent in the D1 analytics table.
    for(let i=0;i<raw.length;i+=25)
      await this.api('/api/agent/analytics','POST',raw.slice(i,i+25));
    this.lastAnalyticsHash=hash;
    return {uploaded:raw.length};
  }
  async syncEvents() {
    if(!this.eventsFile)return {transmitted:0};
    let fileStats;
    try{fileStats=await stat(this.eventsFile);}catch(e){
      if(e.code==='ENOENT')return {transmitted:0};
      throw e;
    }
    if(fileStats.size<this.offset)this.offset=0; // rotated or truncated file
    if(fileStats.size===this.offset)return {transmitted:0};
    // Bounded read protects performance even if VYRON is producing many events.
    const size=Math.min(65536,fileStats.size-this.offset);
    const handle=await open(this.eventsFile,'r');
    let payload='';
    try{
      const bytes=Buffer.alloc(size);
      const result=await handle.read(bytes,0,size,this.offset);
      payload=bytes.subarray(0,result.bytesRead).toString('utf8');
    }finally{await handle.close();}
    const end=payload.lastIndexOf('\n');
    if(end<0)return {transmitted:0};
    const consumed=Buffer.byteLength(payload.slice(0,end+1));
    const before=this.offset;
    const lines=payload.slice(0,end).split('\n');
    const events=[];
    let byteOffset=before;
    for(const line of lines){
      try {
        const value=JSON.parse(line);
        const e=cleanEvent(value,this.deviceId,byteOffset);
        if(e)events.push(e);
      } catch { /* malformed line isolated, never send secrets */ }
      byteOffset+=Buffer.byteLength(line+'\n');
    }
    // Remote endpoint limits 100 events per request. If more, send chunks
    // without advancing the durable cursor until ALL chunks succeed.
    for(let i=0;i<events.length;i+=100) {
      await this.api('/api/agent/events','POST',{
        deviceId:this.deviceId,events:events.slice(i,i+100)
      });
    }
    this.offset=before+consumed;
    await mkdir(dirname(this.cursorFile),{recursive:true,mode:0o700});
    const temp=this.cursorFile+'.tmp';
    await writeFile(temp,JSON.stringify({offset:this.offset}),{mode:0o600});
    await rename(temp,this.cursorFile);
    return {transmitted:events.length};
  }
  async pendingCommands() {
    const data=await this.api('/api/agent/commands?device='+encodeURIComponent(this.deviceId));
    for(const command of data.commands||[]) {
      if(checkRemoteCommand(command).supported) {
        // Status query is safe, idempotent and actually performed before ACK.
        await this.heartbeat();
        await this.api('/api/agent/commands/'+encodeURIComponent(command.id)+'/ack','POST',{
          deviceId:this.deviceId,state:'completed',message:'Heartbeat sent to cloud'
        });
      } else {
        await this.api('/api/agent/commands/'+encodeURIComponent(command.id)+'/ack','POST',{
          deviceId:this.deviceId,state:'failed',message:'Unsafe or unsupported command'
        });
      }
    }
  }
  async tick() {
    if(this.busy)return;
    this.busy=true;
    try {
      await this.heartbeat();
      await this.syncChannelRegistry();
      await this.syncAnalytics();
      await this.syncEvents();
      await this.pendingCommands();
    } finally {this.busy=false;}
  }
}
