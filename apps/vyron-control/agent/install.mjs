import { mkdir,readFile,writeFile,chmod } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const LABEL='studio.vyron.control.agent';
const home=homedir();
const dir=join(home,'.vyron-control-agent');
const configFile=join(dir,'config.json');
const plistFile=join(home,'Library','LaunchAgents',LABEL+'.plist');
function fail(message){console.error(message);process.exit(1);}
if(process.platform!=='darwin')fail('macOS only: LaunchAgent cannot be installed here.');
const url=process.env.VYRON_CONTROL_URL||'';
const token=process.env.VYRON_AGENT_TOKEN||'';
if(!/^https:\/\/.+/.test(url)||token.length<32)
  fail('Set private VYRON_CONTROL_URL (HTTPS) and VYRON_AGENT_TOKEN (32+ chars) on your Mac.');

await mkdir(dir,{recursive:true,mode:0o700});
await chmod(dir,0o700);
const config={url,token,deviceId:process.env.VYRON_DEVICE_ID||'macbook_m1'};
await writeFile(configFile,JSON.stringify(config),{mode:0o600});
await chmod(configFile,0o600);
await mkdir(dirname(plistFile),{recursive:true,mode:0o700});
const script=fileURLToPath(new URL('./run.mjs',import.meta.url));
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;')
  .replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
const plist=`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>${LABEL}</string>
<key>ProgramArguments</key><array>
<string>${escape(process.execPath)}</string>
<string>${escape(script)}</string>
</array>
<key>RunAtLoad</key><true/>
<key>KeepAlive</key><true/>
<key>StandardOutPath</key><string>${escape(join(dir,'agent.log'))}</string>
<key>StandardErrorPath</key><string>${escape(join(dir,'agent-error.log'))}</string>
</dict></plist>`;
try{
  const existing=await readFile(plistFile,'utf8');
  if(!existing.includes('<string>'+LABEL+'</string>'))
    fail('Refusing to overwrite unrelated LaunchAgent.');
}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile(plistFile,plist,{mode:0o600});
await chmod(plistFile,0o600);
const domain='gui/'+process.getuid();
try {execFileSync('/bin/launchctl',['bootout',domain,plistFile],{stdio:'ignore'});}
catch { /* not loaded yet */ }
execFileSync('/bin/launchctl',['bootstrap',domain,plistFile],{stdio:'inherit'});
console.log('VYRON CONTROL Mac agent installed and started at login.');
console.log('Configuration is local and private:',configFile);
console.log('Status: launchctl print '+domain+'/'+LABEL);
