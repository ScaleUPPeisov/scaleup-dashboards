import {describe,it,expect} from 'vitest';
import {parseMetadataFile,validateSequentialMetadata} from '../src/metadata';
import {buildExistingScheduleFromLocal} from '../src/youtubeExisting';

const pack=`VIDEO 1
TITLE
Rainy Paris Nights | French Deep House & Female Vocal Chill Mix
DESCRIPTION
Rainy Paris Nights blends French deep house and smooth female vocals.

Perfect for night driving, studying and working.
TAGS — 461 characters
french deep house,deep house mix,paris night music,female vocal house
SEO focus: French Deep House, Rainy Paris, Female Vocal House, Night Drive
PUBLISH TIME
04:00 KRAT (Krasnoyarsk)

VIDEO 2
TITLE
Paris After Midnight | French Deep House Mood & Late Night Chill
DESCRIPTION
Paris After Midnight is a moody French deep house mix.
TAGS — 466 characters
french deep house,paris after midnight,deep house mood,late night chill
SEO focus: Paris After Midnight, Deep House Mood, French Chill, Late Night
PUBLISH TIME
04:00 KRAT (Krasnoyarsk)`;

const v=(id:string)=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',selected:true});

describe('VYRON 0.9.4 SEO DOCX text parser',()=>{
 it('parses separate-line DOCX labels and ignores SEO focus',()=>{
  const r=parseMetadataFile('french_deep_house_30_video_SEO_USA.docx',pack);
  expect(r).toHaveLength(2);
  expect(r[0].number).toBe(1);
  expect(r[0].title).toContain('Rainy Paris Nights');
  expect(r[0].description).toContain('Perfect for night driving');
  expect(r[0].tags).toEqual(['french deep house','deep house mix','paris night music','female vocal house']);
  expect(r[0].publishTime).toBe('04:00');
  expect(r[0].publishTimezone).toBe('KRAT');
  expect(r[0].publishUtcOffsetMinutes).toBe(420);
  expect(r[0].tags?.join(',')).not.toContain('SEO focus');
 });
 it('requires exact VIDEO 1..N mapping for strict DOCX import',()=>{
  const r=parseMetadataFile('pack.docx',pack);
  expect(validateSequentialMetadata(r,2).ok).toBe(true);
  expect(validateSequentialMetadata(r,3).ok).toBe(false);
 });
 it('uses 04:00 KRAT from SEO pack when scheduling',()=>{
  const r=parseMetadataFile('pack.docx',pack);
  const out=buildExistingScheduleFromLocal([v('1'),v('2')] as any,'2026-09-10T18:00',2,r);
  expect(out[0].publishAt).toBe('2026-09-09T21:00:00.000Z');
  expect(out[1].publishAt).toBe('2026-09-11T21:00:00.000Z');
 });
});
