import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const script=fileURLToPath(new URL('./prepare-vyron-rotated-updater.mjs',import.meta.url));
const stable=JSON.parse(readFileSync(fileURLToPath(new URL('../../src-tauri/tauri.conf.json',import.meta.url)),'utf8'));

function fixture(){
  const dir=mkdtempSync(join(tmpdir(),'vyron-key-rotation-test-'));
  const pub=join(dir,'candidate.pub');
  const out=join(dir,'rotated-overlay.json');
  const fakeKey=Buffer.concat([Buffer.from('Ed'),Buffer.alloc(40,7)]).toString('base64');
  const minisign='untrusted comment: minisign public key: TEST-ONLY-KEY\n'+fakeKey+'\n';
  writeFileSync(pub,Buffer.from(minisign).toString('base64'));
  return {dir,pub,out,release:()=>rmSync(dir,{recursive:true,force:true})};
}
function run(f,extra=[]){
  return spawnSync(process.execPath,[script,'--public-key-file',f.pub,'--output',f.out,'--version','6.1.17',...extra],{encoding:'utf8'});
}
test('new rotated pubkey creates a temporary overlay, preserving app identity and automatic feed',t=>{
  const f=fixture();t.after(f.release);
  const original=readFileSync(fileURLToPath(new URL('../../src-tauri/tauri.conf.json',import.meta.url)),'utf8');
  const result=run(f);
  assert.equal(result.status,0,result.stderr);
  const overlay=JSON.parse(readFileSync(f.out,'utf8'));
  assert.equal(overlay.version,'6.1.17');
  assert.equal(overlay.identifier,'studio.channelflow.desktop');
  assert.equal(overlay.bundle.createUpdaterArtifacts,true);
  assert.deepEqual(overlay.plugins.updater.endpoints,[stable.plugins.updater.endpoints[0]]);
  assert.notEqual(overlay.plugins.updater.pubkey,stable.plugins.updater.pubkey);
  assert.equal(original,readFileSync(fileURLToPath(new URL('../../src-tauri/tauri.conf.json',import.meta.url)),'utf8'));
  assert.match(result.stdout,/ROTATED_UPDATER_OVERLAY_READY=PASS/);
  const decoded=Buffer.from(overlay.plugins.updater.pubkey,'base64').toString('utf8');
  const publicBytes=Buffer.from(decoded.trimEnd().split(/\r?\n/)[1],'base64');
  const expectedFingerprint=createHash('sha256').update(publicBytes).digest('hex');
  assert.match(result.stdout,new RegExp('PUBLIC_KEY_SHA256='+expectedFingerprint));
  assert.doesNotMatch(result.stdout,/PRIVATE KEY|TEST-ONLY-KEY/);
});
test('refuses compromised updater public key',t=>{
  const f=fixture();t.after(f.release);
  writeFileSync(f.pub,stable.plugins.updater.pubkey);
  const result=run(f);
  assert.notEqual(result.status,0);
  assert.match(result.stderr,/COMPROMISED_LEGACY_KEY_FORBIDDEN/);
  assert.equal(existsSync(f.out),false);
});
test('refuses malformed public key and wrong versions',t=>{
  const f=fixture();t.after(f.release);
  writeFileSync(f.pub,'not-a-public-key');
  assert.notEqual(run(f).status,0);
  assert.equal(existsSync(f.out),false);
  writeFileSync(f.pub,Buffer.from('untrusted comment: minisign public key: TEST\n'+Buffer.concat([Buffer.from('Ed'),Buffer.alloc(40,9)]).toString('base64')+'\n').toString('base64'));
  const old=spawnSync(process.execPath,[script,'--public-key-file',f.pub,'--output',f.out,'--version',stable.version],{encoding:'utf8'});
  assert.notEqual(old.status,0);
  assert.match(old.stderr,/VERSION_NOT_NEWER_THAN_STABLE/);
  assert.equal(existsSync(f.out),false);
});
test('never overwrites existing build configuration',t=>{
  const f=fixture();t.after(f.release);
  writeFileSync(f.out,'PRESERVE');
  const result=run(f);
  assert.notEqual(result.status,0);
  assert.equal(readFileSync(f.out,'utf8'),'PRESERVE');
});
