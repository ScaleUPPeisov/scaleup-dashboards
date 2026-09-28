import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeExistingVideo} from './types';
import {summarizeOwnerInventory} from './ownerInventoryRuntime';

const channel={id:'c1',name:'Clover Gramophone'} as Channel;
const video=(id:string,privacyStatus:string,publishAt?:string,publishedAt?:string):YoutubeExistingVideo=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus,publishAt,publishedAt,selected:false});

describe('VYRON 4.0.0 owner inventory truth',()=>{
 it('counts private videos instead of public videoCount=0 fiction',()=>{
  const rows=[video('p1','private'),video('p2','private')];
  const x=summarizeOwnerInventory(channel,rows,'2026-09-28T00:00:00Z',true,new Date('2026-09-28T00:00:00Z'));
  expect(x.total).toBe(2);expect(x.privateCount).toBe(2);expect(x.publicCount).toBe(0)
 });
 it('only future private publishAt is YouTube scheduled',()=>{
  const rows=[
   video('scheduled','private','2026-10-08T00:00:00Z'),
   video('plain-private','private'),
   video('public','public',undefined,'2026-09-28T01:00:00Z')
  ];
  const x=summarizeOwnerInventory(channel,rows,'2026-09-28T00:00:00Z',true,new Date('2026-09-28T00:00:00Z'));
  expect(x.scheduledCount).toBe(1);expect(x.privateCount).toBe(1);expect(x.lastScheduledAt).toBe('2026-10-08T00:00:00Z');expect(x.total).toBe(3)
 });
 it('local Render files are not part of owner YouTube inventory input',()=>{
  const x=summarizeOwnerInventory(channel,[],undefined,false,new Date('2026-09-28T00:00:00Z'));
  expect(x.total).toBe(0);expect(x.scheduledCount).toBe(0)
 })
});
