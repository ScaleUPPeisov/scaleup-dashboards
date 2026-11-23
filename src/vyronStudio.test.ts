import {describe,it,expect} from 'vitest';
import fs from 'node:fs';

// Source-level UI contract: the studio experiment must be removable without
// touching native storage, API clients or the existing PublisherOS handlers.
const app=fs.readFileSync('src/App.tsx','utf8');
const main=fs.readFileSync('src/main.tsx','utf8');
const css=fs.readFileSync('src/vyron-studio.css','utf8');
const publisher=fs.readFileSync('src/PublisherOS.tsx','utf8');
const workspaces=fs.readFileSync('src/vyron-studio-workspaces.css','utf8');
const displayRoutes={
  dashboard:'src/DashboardOS.tsx',channels:'src/ChannelsOS.tsx',
  production:'src/ProductionOS.tsx',inventory:'src/LiveContentInventory.tsx',
  history:'src/HistoryPage.tsx',analytics:'src/Analytics360Page.tsx',
  competitors:'src/CompetitorsPage.tsx',settings:'src/SettingsOS.tsx',
  youtube:'src/YouTubeCenter.tsx',
} as const;

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
  it('loads workspaces UI after first-stage Studio skin',()=>{
    expect(main).toContain("import './vyron-studio-workspaces.css';");
    expect(main.indexOf("import './vyron-studio-workspaces.css';")).toBeGreaterThan(
      main.indexOf("import './vyron-studio.css';"));
  });
  it('keeps all nine application areas present with matching workspace visual contracts',()=>{
    for(const [area,filepath] of Object.entries(displayRoutes)){
      expect(fs.existsSync(filepath),area).toBe(true);
      expect(fs.readFileSync(filepath,'utf8').length,area).toBeGreaterThan(500);
    }
    for(const selector of [
      '.opsDashboardGrid','.channelFleetGrid','.productionJob',
      '.liveInventoryRow','.a360-kpi','.settingsStack',
      '.competitorCard','.youtubeMasterTabs','.accountRow'
    ])expect(workspaces).toContain(selector);
  });
  it('does not add hidden route, table or action surfaces',()=>{
    const c=workspaces.replace(/\/\\*[\\s\\S]*?\\*\//g,'');
    expect(c).not.toMatch(/display\\s*:\\s*none\\s*(!important)?/);
    expect(c).not.toMatch(/visibility\\s*:\\s*hidden/);
    expect(c).not.toMatch(/pointer-events\\s*:\\s*none/);
    expect(c).not.toMatch(/opacity\\s*:\\s*0\\s*(!important)?/);
  });
  it('supports wide Mac desktops, smaller windows, and reduced motion',()=>{
    for(const q of ['max-width:1500px','max-width:1180px','max-width:950px','max-width:700px','prefers-reduced-motion:reduce']){
      expect(workspaces).toContain(q);
    }
    expect(workspaces).toContain('overflow-x:auto');
    expect(workspaces).toContain('.vyronStudio');
  });
  it('does not hide publisher sections or disable actions through CSS',()=>{
    expect(css).not.toContain('.publishStep{display:none');
    expect(css).not.toContain('pointer-events:none');
    expect(css).toContain('@media(max-width:1180px)');
  });
});
