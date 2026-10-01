import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const production=fs.readFileSync('src/ProductionOS.tsx','utf8');
const diag=fs.readFileSync('src/materialsPerfDiag.ts','utf8');
const api=fs.readFileSync('src/productionManagerApi.ts','utf8');

describe('VYRON 6.0.0 Materials binary isolation Test A',()=>{
  it('renders an empty Materials route without mounting MaterialsManager',()=>{
    expect(production).toContain('MATERIALS TEST');
    expect(production).not.toContain("import {MaterialsManager}");
    expect(production).not.toContain("<MaterialsManager");
  });

  it('measures parent transition without React state in the diagnostics reporter',()=>{
    expect(production).toContain('beginMaterialsDiagClick(section)');
    expect(production).toContain('completeMaterialsDiagOnNextPaint()');
    expect(diag).toContain('click → first RAF');
    expect(diag).toContain('ProductionOS renders:');
    expect(diag).toContain('App renders:');
    expect(diag).not.toContain('useState(');
  });

  it('records production-manager IPC calls during the transition',()=>{
    expect(api).toContain('async function tracedInvoke');
    expect(api).toContain('beginMaterialsIpc(command)');
    expect(api).toContain('finishMaterialsIpc(row,true)');
    expect(api).not.toMatch(/=>invoke</);
  });

  it('does not add auth, migration or Windows behavior',()=>{
    expect(production).not.toContain('oauth_vault');
    expect(diag).not.toContain('oauth');
    expect(diag).not.toContain('migration');
    expect(diag).not.toContain('windows');
  });
});
