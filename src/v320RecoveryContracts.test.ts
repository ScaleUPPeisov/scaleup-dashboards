import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(p:string)=>readFileSync(p,'utf8');
describe('VYRON 3.2 crash/power recovery contracts',()=>{
 it('uses durable app-data recovery journal with schema and no OAuth secret fields',()=>{
   const r=read('src-tauri/src/recovery.rs');
   expect(r).toContain('RECOVERY_SCHEMA_VERSION:u32=1');
   expect(r).toContain('.app_data_dir()');
   expect(r).toContain('.join("recovery")');
   expect(r).toContain('sync_all()');
   expect(r).toContain('clean_shutdown');
   expect(r).toContain('volume_uuid');
   expect(r).toContain('WRONG_VOLUME');
   expect(r).toContain('DRIVE_MISSING');
   for(const x of ['refresh_token','access_token','client_secret','vault_key','credentials_json'])expect(r.split('journal_schema_contains_no_secret_fields')[0].toLowerCase()).not.toContain(x);
 });
 it('writes Production through partial staging, flush and atomic rename',()=>{
   const p=read('src-tauri/src/production_manager.rs');
   expect(p).toContain('.vyron-partial');
   expect(p).toContain('copy_and_sync');
   expect(p).toContain('fs::rename(&tmp, &final_dir)');
   expect(p).toContain('.vyron-committed');
   expect(p).toContain('PROJECT_STAGING');
   expect(p).toContain('PROJECT_COMMITTED');
   expect(p.indexOf('register_plan_recovery(&app2,&mut plan)?')).toBeLessThan(p.indexOf('execute_plan(Some(&app2), &plan)'));
 });
 it('has 30 second safe-default recovery UI and never resumes unsafe storage',()=>{
   const g=read('src/RecoveryGate.tsx');
   expect(g).toContain('Date.now()+30_000');
   expect(g).toContain('Восстановить сейчас');
   expect(g).toContain('Не восстанавливать');
   expect(g).toContain('Подробнее');
   expect(g).toContain('if(!candidate||decided.current||!candidate.safeToResume)return');
   expect(g).toContain('Ожидаем ');
   expect(g).toContain('refreshRecoveryCandidate');
 });
 it('supports manual recovery after dismiss without deleting project files',()=>{
   const g=read('src/RecoveryGate.tsx'),r=read('src-tauri/src/recovery.rs'),p=read('src/ProductionManager.tsx');
   expect(g).toContain('dismissRecovery');
   expect(g).toContain('filesDeleted:false');
   expect(r).toContain('s.state="DISMISSED"');
   expect(p).toContain('Восстановить незавершённую работу');
   expect(p).toContain('openRecoveryFlow');
 });
 it('recreates Task Center recovery state and Activity History events',()=>{
   const t=read('src/taskEngine.ts'),c=read('src/TaskCenter.tsx'),types=read('src/types.ts'),g=read('src/RecoveryGate.tsx');
   expect(t).toContain("'PRODUCTION_RECOVERY'");
   for(const s of ['Восстанавливается','Продолжено','Ожидает диск','Требует внимания','Готово'])expect(t).toContain(s);
   expect(c).toContain("PRODUCTION_RECOVERY:'Восстановление Production'");
   for(const e of ['RECOVERY_SESSION_DETECTED','RECOVERY_STARTED','RECOVERY_COMPLETED','RECOVERY_WAITING','RECOVERY_ABANDONED'])expect(types).toContain(e);
   expect(g).toContain("eventType:'RECOVERY_COMPLETED'");
 });
 it('does not put YouTube upload writes inside crash recovery',()=>{
   const g=read('src/RecoveryGate.tsx'),r=read('src-tauri/src/recovery.rs'),app=read('src/App.tsx');
   expect(g).not.toContain('youtubeUploadVideo');
   expect(r).not.toContain('youtube_upload_video');
   expect(r).not.toContain('videos.insert');
   expect(app).toContain('api.youtubeActiveUploads()');
   expect(app).toContain('api.youtubeUploadSessions()');
   expect(app).toContain('buildStaleOperationPatches');
 });
 it('contains explicit double-crash/idempotency and transactional tests',()=>{
   const t=read('src-tauri/src/production_manager_tests.rs');
   expect(t).toContain('acceptance_double_power_loss_recovery_finishes_exactly_ten_without_duplicates');
   expect(t).toContain('acceptance_transactional_commit_leaves_no_partial_and_writes_verified_marker');
   expect(t).toContain('acceptance_execute_twice_is_idempotent_and_history_not_doubled');
 });
 it('keeps updater feed and OAuth architecture out of recovery module',()=>{
   const r=read('src-tauri/src/recovery.rs');
   expect(r).not.toContain('latest.json');
   expect(r).not.toContain('oauth_vault');
   expect(r).not.toContain('youtube.rs');
 });
});
