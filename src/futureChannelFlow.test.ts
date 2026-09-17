import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';

describe('VYRON future-channel integration',()=>{
 it('binds existing id first, then a unique future name, then creates',()=>{const s=readFileSync('src/AccountsPage.tsx','utf8');const start=s.indexOf('function bindProfile');const a=s.indexOf('youtubeChannelId===p.channelId',start);const b=s.indexOf('const future=findFutureChannelMatch',a);const c=s.indexOf("mode:'created'",b);expect(start).toBeGreaterThan(-1);expect(a).toBeGreaterThan(start);expect(b).toBeGreaterThan(a);expect(c).toBeGreaterThan(b)});
 it('exposes explicit future-channel creation in Channels',()=>{const s=readFileSync('src/ChannelsOS.tsx','utf8');expect(s).toContain('+ Будущий канал');expect(s).toContain('Создать будущий канал');expect(s).toContain('БУДУЩИЙ • YouTube не подключён')});
 it('keeps Production independent from YouTube OAuth',()=>{const s=readFileSync('src/ProductionManager.tsx','utf8');expect(s).not.toContain('youtubeProfileId');expect(s).not.toContain('youtubeChannelId')});
});
