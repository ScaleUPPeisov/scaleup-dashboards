import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const app=fs.readFileSync('src/App.tsx','utf8');
const celebration=fs.readFileSync('src/MajorUpdateCelebration.tsx','utf8');
const updateExperience=fs.readFileSync('src/UpdateExperience.tsx','utf8');
const conf=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));

describe('VYRON 4.0.1 branding + one-time celebration',()=>{
  it('uses the owner artwork in sidebar without replacing system app icons',()=>{
    expect(app).toContain('sidebarBrandArtwork');
    expect(app).toContain('VYRON_4_ARTWORK');
    expect(conf.bundle.icon).toEqual(['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns']);
    expect(updateExperience).toContain("../src-tauri/icons/icon.png")
  });

  it('shows celebration only for 4.0.1 and remembers dismissal',()=>{
    expect(celebration).toContain("version!==VYRON_MAJOR_VERSION");
    expect(celebration).toContain('VYRON_LAST_CELEBRATED_KEY');
    expect(celebration).toContain("localStorage.setItem(VYRON_LAST_CELEBRATED_KEY,VYRON_MAJOR_VERSION)")
  });

  it('distinguishes real upgrade from fresh install',()=>{
    expect(app).toContain("VYRON_MAJOR_UPGRADE_TARGET_KEY");
    expect(celebration).toContain("explicitUpgrade||existingState?'upgrade':'fresh'");
    expect(celebration).toContain("mode==='upgrade'?'ПОЗДРАВЛЯЕМ!':'Добро пожаловать в VYRON 4.0.1'")
  });
});
