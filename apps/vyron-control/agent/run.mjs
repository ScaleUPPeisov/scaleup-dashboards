import { MacBridge } from './bridge.mjs';
import { MirrorExport } from './mirror.mjs';

const url=process.env.VYRON_CONTROL_URL;
const token=process.env.VYRON_AGENT_TOKEN;
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
  url,token,deviceId:process.env.VYRON_DEVICE_ID||'macbook_m1',
  eventsFile:process.env.VYRON_AGENT_EVENTS_FILE||mirror?.eventsFile||null,
  statusFile:process.env.VYRON_AGENT_STATUS_FILE||mirror?.statusFile||null,
  channelsFile:process.env.VYRON_AGENT_CHANNELS_FILE||mirror?.channelsFile||null,
  analyticsFile:process.env.VYRON_AGENT_ANALYTICS_FILE||mirror?.analyticsFile||null,
  cursorFile:process.env.VYRON_AGENT_CURSOR_FILE||undefined
});
await bridge.initialize();
console.log('VYRON CONTROL Mac bridge started (no publishing or updater permissions).');
let running=true;
process.on('SIGTERM',()=>{running=false;});
process.on('SIGINT',()=>{running=false;});
while(running) {
  try {if(mirror)await mirror.refresh();await bridge.tick();}
  catch(e){console.error('Mac bridge sync failed:',e.message);}
  await new Promise(resolve=>setTimeout(resolve,45_000));
}
