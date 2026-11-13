import { unlink } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
if(process.platform!=='darwin')throw new Error('macOS only');
const file=join(homedir(),'Library','LaunchAgents','studio.vyron.control.agent.plist');
const domain='gui/'+process.getuid();
try {execFileSync('/bin/launchctl',['bootout',domain,file],{stdio:'ignore'});}catch{}
try {await unlink(file);}catch(error){if(error.code!=='ENOENT')throw error;}
console.log('VYRON CONTROL LaunchAgent stopped and removed.');
console.log('Private credentials and sync history were preserved for recovery.');
console.log('To revoke remote access, rotate the AGENT_TOKEN in Cloudflare.');
