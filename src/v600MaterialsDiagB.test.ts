import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const production=fs.readFileSync('src/ProductionOS.tsx','utf8');
const materials=fs.readFileSync('src/MaterialsManager.tsx','utf8');
const diag=fs.readFileSync('src/materialsPerfDiag.ts','utf8');
const bridge=fs.readFileSync('src/LiveInventoryBridge.tsx','utf8');
const inventory=fs.readFileSync('src/renderInventoryRuntime.ts','utf8');

describe('VYRON 6.0.0 Materials DIAG-B one-build isolation',()=>{
  it('contains all A-J isolation modes in one build',()=>{
    for(const mode of ['A','B','C','D','E','F','G','H','I','J'])expect(production).toContain("'"+mode+"'");
    expect(production).toContain('setMaterialsDiagMode(m)');
    expect(materials).toContain("diagMode==='E'?0");
    expect(materials).toContain("diagMode==='F'?1");
    expect(materials).toContain("diagMode==='G'?5");
    expect(materials).toContain("rank>=8?35");
  });

  it('keeps mode A outside MaterialsManager and gates backend refresh to J',()=>{
    expect(production).toContain("diag.mode==='A'?");
    expect(production).toContain('<b>MATERIALS TEST</b>');
    expect(materials).toContain("if(diagMode!=='J')return;");
  });

  it('can pause Live Inventory without clearing snapshots',()=>{
    expect(production).toContain('LIVE INVENTORY:');
    expect(bridge).toContain('isMaterialsInventoryPaused()');
    expect(inventory).toContain('if(isMaterialsInventoryPaused())return');
    expect(inventory).not.toContain('setState({snapshots:{}})');
  });

  it('can isolate ProductionOS from whole snapshot object updates',()=>{
    expect(production).toContain("diag.snapshotSubscription==='isolated'?EMPTY_DIAG_SNAPSHOTS:s.snapshots");
    expect(production).toContain('SNAPSHOTS:');
  });

  it('tracks snapshot mutations inventory scans long tasks and render causes',()=>{
    expect(inventory).toContain('recordInventorySnapshotMutation()');
    expect(inventory).toContain('beginInventoryScan(channelId,reason)');
    expect(inventory).toContain('finishInventoryScan(diag)');
    expect(diag).toContain("observer.observe({entryTypes:['longtask']})");
    expect(diag).toContain('snapshotUpdates');
    expect(diag).toContain('renderCauses');
  });

  it('has a safe ten-cycle tab-only benchmark and copy report',()=>{
    expect(production).toContain('for(let i=0;i<10;i++)');
    expect(production).toContain("setSection('overview')");
    expect(production).toContain("setSection('materials')");
    expect(production).toContain('RUN MATERIALS BENCHMARK');
    expect(production).toContain('COPY REPORT');
    expect(diag).toContain('navigator.clipboard.writeText');
  });

  it('does not add auth migration or Windows behavior',()=>{
    for(const source of [diag,bridge,inventory]){
      expect(source).not.toContain('refresh_token');
      expect(source).not.toContain('access_token');
      expect(source).not.toContain('Keychain');
      expect(source).not.toContain('tauri.windows');
    }
  });
});
