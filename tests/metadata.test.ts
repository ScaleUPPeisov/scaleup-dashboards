import {describe,it,expect} from 'vitest';
import {parseMetadataFile} from '../src/metadata';
describe('metadata import',()=>{
  it('JSON array',()=>{const r=parseMetadataFile('batch.json','[{"video":"Video_7","title":"A","description":"B","tags":["x","y"]}]');expect(r[0].number).toBe(7);expect(r[0].tags).toEqual(['x','y'])});
  it('JSON map',()=>{const r=parseMetadataFile('batch.json','{"Video_12":{"title":"Night","tags":"deep, house"}}');expect(r[0].number).toBe(12)});
  it('CSV',()=>{const r=parseMetadataFile('batch.csv','number,title,description,tags\n3,"Hello, world",Desc,"a;b"');expect(r[0].title).toBe('Hello, world');expect(r[0].tags).toEqual(['a','b'])});
  it('labelled txt',()=>{const r=parseMetadataFile('Video_004.txt','VIDEO_004\nTITLE: Test\nDESCRIPTION: Long text\nTAGS: one, two');expect(r[0].number).toBe(4);expect(r[0].description).toBe('Long text')});
  it('plain txt uses filename',()=>{const r=parseMetadataFile('Video_009.txt','My title\nMy description');expect(r[0].number).toBe(9);expect(r[0].title).toBe('My title')});
});
