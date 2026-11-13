import { MacBridge } from './bridge.mjs';

const url=process.env.VYRON_CONTROL_URL;
const token=process.env.VYRON_AGENT_TOKEN;
if(!url||!token) {
  console.error('Set VYRON_CONTROL_URL (HTTPS) and VYRON_AGENT_TOKEN in a private process environment.');
  process.exit(1);
}
const bridge=new MacBridge({
  url,token,deviceId:process.env.VYRON_DEVICE_ID||'macbook_m1',
  eventsFile:process.env.VYRON_AGENT_EVENTS_FILE||null,
  statusFile:process.env.VYRON_AGENT_STATUS_FILE||null,
  cursorFile:process.env.VYRON_AGENT_CURSOR_FILE||undefined
});
await bridge.initialize();
console.log('VYRON CONTROL Mac bridge started (no publishing or updater permissions).');
let running=true;
process.on('SIGTERM',()=>{running=false;});
process.on('SIGINT',()=>{running=false;});
while(running) {
  try {await bridge.tick();}
  catch(e){console.error('Mac bridge sync failed:',e.message);}
  await new Promise(resolve=>setTimeout(resolve,45_000));
}
