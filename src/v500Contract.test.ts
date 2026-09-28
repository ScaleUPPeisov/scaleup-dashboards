import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import {OWNER_INVENTORY_COLD_START_DELAY_MS} from './OwnerInventoryScheduler';
import {VYRON_MAJOR_VERSION,VYRON_5_ARTWORK} from './vyronBrand';
import {VYRON_RELEASE_HISTORY,VYRON_CURRENT_RELEASE} from './releaseHistory';

const app=fs.readFileSync('src/App.tsx','utf8');
const updaterUi=fs.readFileSync('src/UpdateExperience.tsx','utf8');
const inventory=fs.readFileSync('src/LiveContentInventory.tsx','utf8');
const packageJson=JSON.parse(fs.readFileSync('package.json','utf8'));
const packageLock=JSON.parse(fs.readFileSync('package-lock.json','utf8'));
const tauri=JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json','utf8'));
const cargo=fs.readFileSync('src-tauri/Cargo.toml','utf8');

describe('VYRON 5.0.0 product contract',()=>{
 it('uses one 5.0.0 product identity without changing the bundle id',()=>{
  expect(VYRON_MAJOR_VERSION).toBe('5.0.0');
  expect(packageJson.version).toBe('5.0.0');
  expect(packageLock.version).toBe('5.0.0');
  expect(packageLock.packages[''].version).toBe('5.0.0');
  expect(tauri.version).toBe('5.0.0');
  expect(tauri.identifier).toBe('studio.channelflow.desktop');
  expect(cargo).toMatch(/\[package\][\s\S]*version\s*=\s*"5\.0\.0"/);
 });
 it('removes only the top-level History shortcut while preserving YouTube navigation',()=>{
  expect(app).not.toContain("id:'history',page:'youtube'");
  expect(app).toContain("id:'youtube',page:'youtube'");
  expect(app).toContain("label:'Запас видео'");
 });
 it('protects the first two minutes from heavy owner inventory refresh',()=>{
  expect(OWNER_INVENTORY_COLD_START_DELAY_MS).toBeGreaterThanOrEqual(120_000);
 });
 it('uses the approved bundled VYRON artwork for the major update experience',()=>{
  expect(VYRON_5_ARTWORK).toBeTruthy();
  expect(updaterUi).toContain('VYRON_5_ARTWORK');
  expect(updaterUi).toContain('БОЛЬШОЕ ОБНОВЛЕНИЕ');
 });
 it('exposes finder-free daily operations in inventory',()=>{
  expect(inventory).toContain('DailyOperationsCenter');
  expect(inventory).toContain('ЛОКАЛЬНЫЙ ЗАПАС');
 });
 it('has a canonical 5.0 major candidate plus the real production chain',()=>{
  expect(VYRON_CURRENT_RELEASE.version).toBe('5.0.0');
  expect(VYRON_CURRENT_RELEASE.type).toBe('MAJOR');
  expect(VYRON_CURRENT_RELEASE.prerelease).toBe(true);
  const versions=new Set(VYRON_RELEASE_HISTORY.map(x=>x.version));
  for(const v of ['4.0.1','4.0.0','3.3.5','3.3.4','3.3.3','3.3.2','3.3.1','3.3.0'])expect(versions.has(v)).toBe(true);
 });
});
