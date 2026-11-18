import { MacBridge } from './bridge.mjs';
import { MirrorExport } from './mirror.mjs';
import { readFile,stat } from 'node:fs/promises';
import {setTimeout as sleep} from 'node:timers/promises';
import {diagnosticCode} from './retry.mjs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const configPath=process.env.VYRON_AGENT_CONFIG_FILE||
  join(homedir(),'.vyron-control-agent','config.json');
let local={};
try {
  const meta=await stat(configPath);
  if((meta.mode&0o077)!==0)
    throw new Error('Private agent config must be readable only by its owner (chmod 600).');
  local=JSON.parse(await readFile(configPath,'utf8'));
}catch(error){if(error.code!=='ENOENT')throw error;}
const url=process.env.VYRON_CONTROL_URL||local.url;
const token=process.env.VYRON_AGENT_TOKEN||local.token;
if(!url||!token) {
  console.error('Set VYRON_CONTROL_URL (HTTPS) and VYRON_AGENT_TOKEN in a private process environment.');
  process.exit(1);
}
// Use the existing VYRON native state mirror automatically. No VYRON binary
// changes, app runtime hooks, OAuth reads or Keychain access required.
const mirror=process.env.VYRON_AGENT_NO_MIRROR==='1'?null:new MirrorExport({
  ...(process.env.VYRON_AGENT_STATE_MIRROR?
    {mirrorFile:process.env.VYRON_AGENT_STATE_MIRROR}:{}),
  ...(process.env.VYRON_AGENT_EXPORT_DIR?
    {outDir:process.env.VYRON_AGENT_EXPORT_DIR}:{})
});
if(mirror)await mirror.initialize();
const bridge=new MacBridge({
  url,token,deviceId:process.env.VYRON_DEVICE_ID||local.deviceId||'macbook_m1',
  eventsFile:process.env.VYRON_AGENT_EVENTS_FILE||mirror?.eventsFile||null,
  statusFile:process.env.VYRON_AGENT_STATUS_FILE||mirror?.statusFile||null,
  channelsFile:process.env.VYRON_AGENT_CHANNELS_FILE||mirror?.channelsFile||null,
  analyticsFile:process.env.VYRON_AGENT_ANALYTICS_FILE||mirror?.analyticsFile||null,
  productionFile:process.env.VYRON_AGENT_PRODUCTION_FILE||mirror?.productionFile||null,
  cursorFile:process.env.VYRON_AGENT_CURSOR_FILE||undefined
});
await bridge.initialize();
console.log('VYRON CONTROL Mac bridge started (no publishing or updater permissions).');
let running=true;
const stop=new AbortController();
const shutdown=()=>{running=false;stop.abort();};
process.on('SIGTERM',shutdown);
process.on('SIGINT',shutdown);
let consecutiveFailures=0;
while(running){
  try {
    if(mirror){
      try {
        const result=await mirror.refresh();
        bridge.setMirrorWarning(result.status==='mirror_missing'?
          new Error('mirror_missing'):null);
      }catch(error){
        bridge.setMirrorWarning(error);
        // A bad or missing local VYRON snapshot must never silence Cloudflare heartbeat.
        console.error('Mac bridge local snapshot:',diagnosticCode(error));
      }
    }
    const results=await bridge.tick();
    consecutiveFailures=0;
    for(const [operation,result] of Object.entries(results||{})){
      if(result?.failed)console.error('Mac bridge '+operation+': '+result.code+
        '; retry scheduled');
    }
  }catch(error){
    consecutiveFailures=Math.min(consecutiveFailures+1,12);
    console.error('Mac bridge heartbeat:',diagnosticCode(error));
  }
  if(!running)break;
  const base=consecutiveFailures?
    Math.min(15*60_000,15_000*2**(consecutiveFailures-1)):45_000;
  const delay=consecutiveFailures?Math.round(base*(0.9+Math.random()*.2)):base;
  try{await sleep(delay,undefined,{signal:stop.signal});}
  catch(error){if(error.name!=='AbortError')console.error('Mac bridge sleep:',diagnosticCode(error));}
}
