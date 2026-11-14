import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(name:string)=>fs.readFileSync(name.startsWith('../')?name.slice(3):`src/${name.replace(/^\.\//,'')}`,'utf8');

describe('VYRON 6.1.17 owner performance validation',()=>{
  it('is available in Settings without Terminal and exports safe JSON',()=>{
    const settings=read('./SettingsOS.tsx'),validation=read('./performanceValidation.ts'),native=read('../src-tauri/src/performance_probe.rs');
    expect(settings).toContain('Проверить производительность VYRON');
    expect(settings).toContain('Экспорт JSON');
    expect(validation).toContain("schema:'vyron-owner-performance-v1'");
    expect(validation).toContain('heavyWriteTestRun:false');
    expect(validation).not.toContain('indexMusic(');
    expect(native).toContain('PERFORMANCE_REPORT_SENSITIVE_KEY');
    expect(native).toContain('OWNER_REPORT_MAX_BYTES');
    expect(native).toContain('PERFORMANCE_REPORT_EXTENSION_MUST_BE_JSON');
  });

  it('covers the requested navigation and production tabs',()=>{
    const validation=read('./performanceValidation.ts');
    for(const route of ["'dashboard'","'production'","'youtube'","'analytics'","'settings'"])expect(validation).toContain(route);
    for(const tab of ['Обзор','Материалы','Сборка проектов'])expect(validation).toContain(tab);
    expect(validation).toContain('4_000');
  });

  it('keeps the isolated synthetic M1 probe and instruments real expensive paths',()=>{
    const legacy=read('./M1PerformanceProbe.tsx'),inventory=read('./renderInventoryRuntime.ts'),production=read('./productionManagerApi.ts'),api=read('./api.ts');
    expect(legacy).toContain('performanceProbeEnabled');
    expect(inventory).toContain("recordPerformanceOperation('inventory.scanAll',reason)");
    expect(inventory).toContain("recordPerformanceOperation('inventory.scanChannel',reason)");
    expect(production).toContain("recordPerformanceOperation('music.index')");
    expect(api).toContain("recordPerformanceOperation('render.scanFolder')");
    expect(api).toContain("recordPerformanceOperation('render.fingerprint')");
  });
});

