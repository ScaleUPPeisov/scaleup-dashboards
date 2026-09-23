import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {VYRON_RELEASE_HISTORY,VYRON_FIRST_RELEASE,VYRON_CURRENT_RELEASE,groupReleaseHistoryByDay} from './releaseHistory';

const read=(p:string)=>readFileSync(p,'utf8');
describe('VYRON 3.2 history and navigation UX',()=>{
 it('backfills the complete public VYRON journey from 0.5.0',()=>{
   expect(VYRON_FIRST_RELEASE.version).toBe('0.5.0');
   expect(VYRON_FIRST_RELEASE.date).toBe('2026-08-31');
   expect(VYRON_CURRENT_RELEASE.version).toBe('3.2.1');
   for(const v of ['0.9.0','0.9.1','0.9.2','0.9.9','1.0.0','1.0.15','1.1.0','1.2.0','2.0.0','2.0.13','2.1.0','2.1.15-rc.7','3.0.0','3.1.0','3.1.1','3.2.0','3.2.1'])expect(VYRON_RELEASE_HISTORY.some(x=>x.version===v),v).toBe(true);
   expect(VYRON_RELEASE_HISTORY.some(x=>x.version==='0.4.0')).toBe(false);
   expect(VYRON_RELEASE_HISTORY.length).toBeGreaterThanOrEqual(50);
 });
 it('groups releases by day from one canonical source',()=>{
   const days=groupReleaseHistoryByDay();
   expect(days.length).toBeGreaterThan(5);
   expect(days[0][0]).toBe('2026-09-23');
   expect(days.flatMap(x=>x[1]).length).toBe(VYRON_RELEASE_HISTORY.length);
 });
 it('keeps owner preview build noise inside technical details',()=>{
   const v300=VYRON_RELEASE_HISTORY.find(x=>x.version==='3.0.0')!;
   expect(v300.technicalBuilds).toEqual([187,193,210,246,270,281,320]);
   expect(VYRON_RELEASE_HISTORY.some(x=>/^187$|^193$|^210$|^246$|^270$|^281$|^320$/.test(x.version))).toBe(false);
 });
 it('renders compact searchable filtered timeline',()=>{
   const s=read('src/ReleaseHistoryTimeline.tsx');
   expect(s).toContain('Найти изменение...');
   expect(s).toContain("['features','Функции']");
   expect(s).toContain("['fixes','Исправления']");
   expect(s).toContain("['interface','Интерфейс']");
   expect(s).toContain("['reliability','Надёжность']");
   expect(s).toContain('Все изменения');
   expect(s).toContain('Технические сведения');
   expect(s).toContain('groupReleaseHistoryByDay');
 });
 it('removes redundant Settings panels without removing runtime notifications',()=>{
   const s=read('src/SettingsOS.tsx'),app=read('src/App.tsx'),notifications=read('src/notificationCenter.ts');
   expect(s).not.toContain('Последние уведомления');
   expect(s).not.toContain('Уведомлений пока нет');
   expect(s).not.toContain('Целевой рендер');
   expect(s).toContain('<ReleaseHistoryTimeline/>');
   expect(app).toContain('<NotificationCenter/>');
   expect(notifications).toContain('success:8000');
   expect(notifications).toContain('info:8000');
 });
 it('normalizes aliases to exactly one sidebar active page and one icon slot',()=>{
   const app=read('src/App.tsx'),css=read('src/ui-layout-contract.css');
   expect(app).toContain("page==='autopilot'?'dashboard'");
   expect(app).toContain("page==='accounts'?'settings'");
   expect(app).toContain("page==='metadata'||page==='existing'||page==='publisher'?'youtube'");
   expect(app).toContain("page==='content'?'production'");
   expect(app).toContain("aria-current={active?'page':undefined}");
   expect(app).toContain('sidebarIconSlot');
   expect(css).toContain('grid-template-columns:24px minmax(0,1fr)');
   expect(css).toContain('.sidebar nav .sidebarNavItem.active');
 });
});
