import {describe,expect,it} from 'vitest';
import {buildExistingMetadataPatch} from './metadataPatch';
import type {YoutubeExistingVideo} from './types';

const video=(privacyStatus:'private'|'public'|'unlisted'='private',publishAt?:string):YoutubeExistingVideo=>({
  id:'VID',title:'Old title',description:'Old description',tags:['old','tag'],privacyStatus,publishAt,categoryId:'10',selected:true
} as YoutubeExistingVideo);

describe('VYRON 6.1.10 exact metadata PATCH contract',()=>{
  it('A PRIVATE title-only emits title and no schedule/privacy fields',()=>{
    const patch=buildExistingMetadataPatch(video('private'),{title:'New title'} as any,{scheduleEditEnabled:false});
    expect(patch).toEqual({title:'New title'});
    expect(patch).not.toHaveProperty('publishAt');
    expect(patch).not.toHaveProperty('privacyStatus');
  });
  it('B existing future publishAt stays absent for title-only',()=>{
    const patch=buildExistingMetadataPatch(video('private','2026-11-01T18:00:00+07:00'),{title:'New title'} as any,{scheduleEditEnabled:false,publishAt:'2026-12-01T18:00:00+07:00'});
    expect(patch).toEqual({title:'New title'});
  });
  it('C UNLISTED description-only emits description only',()=>{
    expect(buildExistingMetadataPatch(video('unlisted'),{description:'New description'} as any,{scheduleEditEnabled:false})).toEqual({description:'New description'});
  });
  it('D PUBLIC tags-only emits tags only',()=>{
    expect(buildExistingMetadataPatch(video('public'),{tags:['new','tags']} as any,{scheduleEditEnabled:false})).toEqual({tags:['new','tags']});
  });
  it('E explicit schedule opt-in may emit publishAt',()=>{
    const publishAt='2026-12-01T18:00:00+07:00';
    expect(buildExistingMetadataPatch(video('private','2026-11-01T18:00:00+07:00'),{} as any,{scheduleEditEnabled:true,publishAt})).toEqual({publishAt});
  });
  it('F batch of 9 PRIVATE title-only rows needs no schedule payload',()=>{
    const patches=Array.from({length:9},(_,i)=>buildExistingMetadataPatch({...video('private',`2026-11-${String(i+1).padStart(2,'0')}T18:00:00+07:00`),id:`V${i}`} as YoutubeExistingVideo,{title:`New ${i}`} as any,{scheduleEditEnabled:false}));
    expect(patches).toHaveLength(9);
    patches.forEach((patch,i)=>expect(patch).toEqual({title:`New ${i}`}));
  });
});
