#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/youtubeExisting.ts'
s=p.read_text()
old="export function buildExistingScheduleFromLocal(videos:YoutubeExistingVideo[],startLocal:string,cadenceDays:number,meta:ImportedMetadata[]=[]){"
new="export function buildExistingScheduleFromLocal(videos:YoutubeExistingVideo[],startLocal:string,cadenceDays:number,meta:(ImportedMetadata|undefined)[]=[]){"
assert old in s, 'buildExistingScheduleFromLocal signature changed'
s=s.replace(old,new,1)
old2="const m=meta.find(x=>x.number===i+1)||meta[i];"
new2="const m=meta.find(x=>x?.number===i+1)||meta[i];"
assert old2 in s, 'unsafe sparse metadata lookup missing'
s=s.replace(old2,new2,1)
p.write_text(s)

test=ROOT/'src/youtubeExisting.selectAll.test.ts'
test.write_text("""import {describe,expect,it} from 'vitest';
import {buildExistingScheduleFromLocal} from './youtubeExisting';

describe('Metadata select all scheduling regression',()=>{
  it('does not crash when 99 YouTube videos are selected before DOCX is loaded',()=>{
    const videos=Array.from({length:99},(_,i)=>({
      id:`video-${i+1}`,
      title:`Video ${i+1}`,
      privacyStatus:'private',
      selected:true
    })) as any[];
    const sparseMeta=Array.from({length:99},()=>undefined);
    expect(()=>buildExistingScheduleFromLocal(videos,'2026-09-05T18:00',2,sparseMeta)).not.toThrow();
    const scheduled=buildExistingScheduleFromLocal(videos,'2026-09-05T18:00',2,sparseMeta);
    expect(scheduled).toHaveLength(99);
    expect(scheduled.every(v=>Boolean(v.publishAt))).toBe(true);
  });

  it('keeps positional metadata optional while still honoring a provided publish time',()=>{
    const videos=[{id:'a',title:'A',privacyStatus:'private'},{id:'b',title:'B',privacyStatus:'private'}] as any[];
    const meta=[undefined,{number:2,publishTime:'04:00'}] as any[];
    const scheduled=buildExistingScheduleFromLocal(videos,'2026-09-05T18:00',2,meta);
    expect(scheduled).toHaveLength(2);
    expect(scheduled[0].publishAt).toBeTruthy();
    expect(scheduled[1].publishAt).toContain('T21:00:00.000Z');
  });
});
""")
print('VYRON 2.0.4 Metadata select-all crash fix applied')
