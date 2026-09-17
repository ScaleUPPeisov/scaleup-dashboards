import {describe,expect,it} from 'vitest';import {readFileSync} from 'node:fs';
describe('Production future-channel shortcut',()=>{
 it('exists beside the Materials channel selector',()=>{const s=readFileSync('src/ProductionOS.tsx','utf8');const start=s.indexOf("tab==='materials'");const end=s.indexOf('<ProductionManager view="materials"/>',start);const block=s.slice(start,end);expect(block).toContain('+ Будущий канал');expect(block).toContain('+ Импортировать изображения');expect(block.indexOf('+ Будущий канал')).toBeLessThan(block.indexOf('+ Импортировать изображения'))});
 it('creates the existing local future-channel identity and selects it immediately',()=>{const s=readFileSync('src/ProductionOS.tsx','utf8');expect(s).toContain('const created=addChannel({name})');expect(s).toContain('setChannelId(created.id)');expect(s).toContain('hasChannelNameConflict(channels,name)')});
 it('does not add YouTube coupling to Production',()=>{const s=readFileSync('src/ProductionOS.tsx','utf8');expect(s).not.toContain('youtubeProfileId');expect(s).not.toContain('youtubeChannelId')});
});
