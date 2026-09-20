import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

const app=readFileSync('src/App.tsx','utf8');
const settings=readFileSync('src/SettingsOS.tsx','utf8');
const runtime=readFileSync('src/updaterRuntime.ts','utf8');
const schedule=readFileSync('src/updaterSchedule.ts','utf8');
const api=readFileSync('src/api.ts','utf8');

describe('VYRON 2.1.15 RC5 updater reliability wiring',()=>{
  it('boots once, schedules 15m checks and has 5m foreground/network gates',()=>{
    expect(schedule).toContain('UPDATER_AUTO_INTERVAL_MS=15*60*1000');
    expect(schedule).toContain('UPDATER_FOREGROUND_MIN_AGE_MS=5*60*1000');
    expect(app).toContain('await bootstrapUpdater()');
    expect(app).toContain('await updaterCheck({silent:true})');
    expect(app).toContain("document.addEventListener('visibilitychange'");
    expect(app).toContain("window.addEventListener('online'");
  });
  it('keeps automatic checks disabled when autoCheckUpdates=false while manual force remains available',()=>{
    expect(app).toContain('!settings.autoCheckUpdates');
    expect(settings).toContain('checkUpdate({force:true})');
  });
  it('keeps single-flight even for manual force and blocks checks during active updater transfer/install',()=>{
    expect(runtime).toContain('if(checkPromise)return checkPromise');
    expect(runtime).toContain("'DOWNLOADING','VERIFYING','READY_TO_INSTALL','INSTALLING','READY_TO_RESTART','RESTARTING'");
  });
  it('uses no-cache updater headers and never touches YouTube quota/API from updater code',()=>{
    expect(api).toContain('check(UPDATER_CHECK_OPTIONS)');
    expect(runtime.toLowerCase()).not.toContain('youtube');
    expect(runtime).not.toContain('videos.insert');
  });
  it('shows last/next checks and immediate sidebar availability',()=>{
    expect(settings).toContain('Следующая автоматическая проверка');
    expect(settings).toContain('Automatic interval');
    expect(settings).toContain('15 минут');
    expect(app).toContain('🔔 Доступно обновление');
  });
  it('keeps explicit install/restart semantics and active-work blockers',()=>{
    expect(runtime).toContain("status:'READY_TO_INSTALL'");
    expect(runtime).toContain('if(blockers.length)');
    expect(settings).toContain('УСТАНОВИТЬ И ПЕРЕЗАПУСТИТЬ');
  });
});
