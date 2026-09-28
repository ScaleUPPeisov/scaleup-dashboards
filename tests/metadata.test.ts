import {describe,it,expect} from 'vitest';
import {parseMetadataFile} from '../src/metadata';
describe('metadata import',()=>{
  it('JSON array',()=>{const r=parseMetadataFile('batch.json','[{"video":"Video_7","title":"A","description":"B","tags":["x","y"]}]');expect(r[0].number).toBe(7);expect(r[0].tags).toEqual(['x','y'])});
  it('JSON map',()=>{const r=parseMetadataFile('batch.json','{"Video_12":{"title":"Night","tags":"deep, house"}}');expect(r[0].number).toBe(12)});
  it('CSV',()=>{const r=parseMetadataFile('batch.csv','number,title,description,tags\n3,"Hello, world",Desc,"a;b"');expect(r[0].title).toBe('Hello, world');expect(r[0].tags).toEqual(['a','b'])});
  it('labelled txt',()=>{const r=parseMetadataFile('Video_004.txt','VIDEO_004\nTITLE: Test\nDESCRIPTION: Long text\nTAGS: one, two');expect(r[0].number).toBe(4);expect(r[0].description).toBe('Long text')});
  it('plain txt uses filename',()=>{const r=parseMetadataFile('Video_009.txt','My title\nMy description');expect(r[0].number).toBe(9);expect(r[0].title).toBe('My title')});
  it('parses bare PUBLISH with DD.MM.YYYY, per-video time, KRAT and ignores trailing note',()=>{const r=parseMetadataFile('pack.docx','VIDEO 001\nTITLE\nTest\nPUBLISH\n28.09.2026 • 07:00 KRAT • Тест A');expect(r[0]).toMatchObject({number:1,publishAt:'2026-09-28',publishTime:'07:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420})});
  it('parses inline PUBLISH colon and space variants without breaking existing labels',()=>{const a=parseMetadataFile('a.txt','VIDEO 001\nTITLE: A\nPUBLISH: 29.09.2026 • 08:30 KRAT')[0],b=parseMetadataFile('b.txt','VIDEO 002\nTITLE: B\nPUBLISH 30.09.2026 • 10:00 KRAT')[0];expect(a).toMatchObject({publishAt:'2026-09-29',publishTime:'08:30'});expect(b).toMatchObject({publishAt:'2026-09-30',publishTime:'10:00'});});
  it('keeps legacy PUBLISH DATE and PUBLISH TIME support',()=>{const r=parseMetadataFile('legacy.txt','VIDEO 003\nTITLE: Legacy\nPUBLISH DATE\n2026-10-01\nPUBLISH TIME\n18:00 KRAT')[0];expect(r).toMatchObject({publishAt:'2026-10-01',publishTime:'18:00',publishTimezone:'KRAT',publishUtcOffsetMinutes:420})});
});
