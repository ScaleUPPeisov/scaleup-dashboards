import fs from 'node:fs';
import {describe,expect,it} from 'vitest';

const app=fs.readFileSync('src/App.tsx','utf8');
const celebration=fs.readFileSync('src/MajorUpdateCelebration.tsx','utf8');
const updateExperience=fs.readFileSync('src/UpdateExperience.tsx','utf8');
const updaterRuntime=fs.readFileSync('src/updaterRuntime.ts','utf8');
const celebrationCss=fs.readFileSync('src/v400-celebration.css','utf8');
const conf=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));

describe('VYRON update branding + one-time celebration',()=>{
  it('uses the owner artwork in sidebar without replacing system app icons',()=>{
    expect(app).toContain('sidebarBrandArtwork');
    expect(app).toContain('VYRON_5_ARTWORK');
    expect(conf.bundle.icon).toEqual(['icons/32x32.png','icons/128x128.png','icons/128x128@2x.png','icons/icon.icns','icons/icon.ico']);
    expect(updateExperience).toContain("../src-tauri/icons/icon.png")
  });

  it('celebrates every successful updater version once and remembers dismissal',()=>{
    expect(app).toContain('VYRON_UPDATE_CELEBRATION_TARGET_KEY');
    expect(app).toContain('VYRON_UPDATE_CELEBRATION_NOTES_KEY');
    expect(celebration).toContain('genericTarget===version');
    expect(celebration).toContain('VYRON_LAST_CELEBRATED_KEY');
    expect(celebration).toContain('localStorage.setItem(VYRON_LAST_CELEBRATED_KEY,runtimeVersion)');
    expect(updaterRuntime).toContain("notes:get().notes||''");
  });

  it('shows animated particles, owner logo and actual update highlights',()=>{
    expect(celebration).toContain('majorCelebrationFx');
    expect(celebration).toContain('Array.from({length:14}');
    expect(celebration).toContain('majorCelebrationArtwork');
    expect(celebration).toContain('Что сделано в этом обновлении');
    expect(celebration).toContain('releaseHighlights(notes)');
    expect(celebrationCss).toContain('@keyframes vyronParticle');
    expect(celebrationCss).toContain('@keyframes vyronLogoIn');
    expect(celebrationCss).toContain('.reduceMotion .majorCelebrationArtwork');
  });

  it('distinguishes real update from fresh install',()=>{
    expect(celebration).toContain("explicitUpgrade||existingState");
    expect(celebration).toContain("mode==='upgrade'?'ПОЗДРАВЛЯЕМ!'");
    expect(celebration).toContain('Добро пожаловать в VYRON')
  });
});
