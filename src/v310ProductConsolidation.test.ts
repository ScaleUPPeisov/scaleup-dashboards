import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const read=(x:string)=>readFileSync(new URL(x,import.meta.url),'utf8');
describe('VYRON 3.1 product consolidation contracts',()=>{
 it('removes Data YouTube and duplicate Calendar top tabs',()=>{const s=read('./YouTubeCenter.tsx');expect(s).not.toContain("['data','Данные YouTube']");expect(s).not.toContain("['calendar','Календарь']");expect(s).toContain("if(tab==='calendar')return'schedule'")});
 it('analytics refresh is self-contained',()=>{const s=read('./AnalyticsPage.tsx');expect(s).toContain('refreshChannelAnalytics');expect(s).not.toContain("Обновить в YouTube")});
 it('competitor refresh stays in radar',()=>{const s=read('./CompetitorsPage.tsx');expect(s).toContain('refreshCompetitor');expect(s).not.toContain('Обновить через YouTube')});
 it('production has no duplicate ENDLUME primary tab',()=>{const s=read('./ProductionOS.tsx');expect(s).not.toContain(">ENDLUME</button>")});
 it('keeps Shorts removed and one shared channel context',()=>{const y=read('./YouTubeCenter.tsx');expect(y).not.toContain('Shorts');expect(y).toContain('<YouTubeChannelBar/>')});
 it('removes static sidebar updater card and provides branded update UI',()=>{const a=read('./App.tsx'),u=read('./UpdateExperience.tsx');expect(a).not.toContain('<UpdaterSidebar/><nav>');expect(a).toContain('<UpdateExperience/>');expect(u).toContain("../src-tauri/icons/icon.png")});
 it('normal notifications use eight seconds',()=>{const s=read('./notificationCenter.ts');expect(s).toContain('success:8000');expect(s).toContain('info:8000')});
});
