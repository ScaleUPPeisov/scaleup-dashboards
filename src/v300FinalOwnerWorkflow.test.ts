import {describe,expect,it} from 'vitest';
import fs from 'node:fs';

describe('VYRON 3.0.0 final owner workflow contracts',()=>{
 const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');
 const app=fs.readFileSync('src/App.tsx','utf8');
 const modal=fs.readFileSync('src/ModalPortal.tsx','utf8');
 const notifications=fs.readFileSync('src/NotificationStack.tsx','utf8');
 const rust=fs.readFileSync('src-tauri/src/oauth_vault.rs','utf8');
 const security=fs.readFileSync('src-tauri/src/security.rs','utf8');
 const workflow=fs.readFileSync('.github/workflows/vyron-300-physical-candidate.yml','utf8');

 it('mounts dialogs in document.body and preserves viewport scroll/focus',()=>{
  expect(modal).toContain('createPortal');
  expect(modal).toContain('document.body');
  expect(modal).toContain('window.scrollTo(scrollX,scrollY)');
  expect(modal).toContain("e.key==='Escape'");
  expect(publisher).toContain('<ModalPortal onClose=');
 });
 it('treats current physical scan as the Publisher source of truth',()=>{
  expect(publisher).toContain("sourceAvailability==='ONLINE'&&renderScan");
  expect(publisher).toContain("currentPhysicalPaths.has(normalizeRenderPath(j.finalPath||''))");
  expect(publisher).toContain("setSourceAvailability('OFFLINE');setRenderScan(null)");
  expect(publisher).toContain('Внешний диск недоступен');
  expect(publisher).toContain("if(sourceAvailability!=='ONLINE')");
 });
 it('shows operational connections instead of local channel count',()=>{
  expect(app).toContain('Подключено {connectedCount} / {channels.length}');
  expect(app).toContain("x.credentialState==='READY'||x.credentialState==='CONNECTED'");
  expect(app).not.toContain('{channels.length} каналов</span>');
 });
 it('keeps current unmatched physical generations selectable without YouTube-ID gate',()=>{
  expect(publisher).toContain("r.classification==='NEW_CANDIDATE'||r.classification==='NEW_GENERATION'");
  expect(publisher).not.toContain('Проверить YouTube ID');
  expect(publisher).toContain('channelJobs.filter(j=>selectableJobIds.has(j.id)).map(j=>j.id)');
 });
 it('deduplicates logical notifications by operationId',()=>{
  expect(notifications).toContain('findIndex(x=>x.operationId===n.operationId)');
  expect(notifications).toContain('queue.current[queued]=n');
 });
 it('stores OAuth secrets in authenticated encrypted vault behind one stable Keychain master key',()=>{
  expect(rust).toContain('XChaCha20Poly1305');
  expect(rust).toContain('oauth-vault.enc');
  expect(rust).toContain('MASTER_CACHE');
  expect(rust).toContain('VAULT_CACHE');
  expect(rust).toContain('atomic');
  expect(security).toContain('com.scaleup.vyron.oauth-vault');
  expect(security).toContain('master-key');
 });
 it('verifies preview publication at immutable commit and treats branch CDN as propagation only',()=>{
  expect(workflow).toContain('MAIN_COMMIT_SHA');
  expect(workflow).toContain('owner-preview-authoritative.json');
  expect(workflow).toContain('OWNER_PREVIEW_FEED_PROPAGATION_PENDING');
  expect(workflow).not.toContain('test "$OK" = 1');
 });
});
