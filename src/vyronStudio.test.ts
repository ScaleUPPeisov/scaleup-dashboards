import {describe,it,expect} from 'vitest';
import fs from 'node:fs';

// Source-level UI contract: the studio experiment must be removable without
// touching native storage, API clients or the existing PublisherOS handlers.
const app=fs.readFileSync('src/App.tsx','utf8');
const main=fs.readFileSync('src/main.tsx','utf8');
const css=fs.readFileSync('src/vyron-studio.css','utf8');
const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');

describe('VYRON Studio isolated design contract',()=>{
  it('loads the visual layer after existing CSS',()=>{
    expect(main).toContain("import './vyron-studio.css';");
    expect(main.indexOf("import './vyron-studio.css';")).toBeGreaterThan(
      main.indexOf("import './v400-celebration.css';"));
  });
  it('applies the skin only to the real app shell',()=>{
    expect(app).toContain('appShell vyronStudio');
    expect(css).toContain('.vyronStudio .publishStepGrid');
    expect(css).toContain('.vyronStudio .topbar.vyronMasterTopbar');
    expect(css).toContain('.vyronStudio .sidebar');
  });
  it('keeps all nine navigable app routes available',()=>{
    for(const id of ['dashboard','channels','production','inventory','history','youtube','analytics','competitors','settings']){
      expect(app).toContain(`{id:'${id}',page:`);
    }
    expect(app).toContain('onClick={open}');
  });
  it('collapsed navigation is keyboard accessible and reversible',()=>{
    expect(app).toContain('studioSidebarToggle');
    expect(app).toContain('aria-expanded={!compact}');
    expect(app).toContain('aria-label={n.label}');
    expect(app).toContain('setStudioSidebarCollapsed(value=>!value)');
  });
  it('preserves publication pipeline entry points',()=>{
    for(const token of ['PublisherShell','PublisherVideoPicker','syncScheduleFromYoutube()',
      'reconcileExistingUploads()','scanRenderFolder()','publisher-schedule',
      'publisher-metadata','publisher-thumbs','publisher-cleanup','quotaPreflightCard']){
      expect(publisher).toContain(token);
    }
  });
  it('does not hide publisher sections or disable actions through CSS',()=>{
    expect(css).not.toMatch(/publishStep[^{}]*\\{[^{}]*display\\s*:\\s*none/);
    expect(css).not.toMatch(/pointer-events\\s*:\\s*none/);
    expect(css).toContain('@media(max-width:1180px)');
  });
});
