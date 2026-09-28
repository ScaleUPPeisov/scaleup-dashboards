import fs from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {Channel,YoutubeExistingVideo} from './types';
import {ownerInventoryFromVideos,OWNER_INVENTORY_TTL_MS} from './youtubeOwnerInventory';

const channel:Pick<Channel,'id'|'name'|'youtubeProfileId'|'youtubeChannelId'>={
  id:'c1',name:'Clover Gramophone',youtubeProfileId:'p1',youtubeChannelId:'UC1'
};
const video=(id:string,privacyStatus:string,publishAt?:string,publishedAt='2026-09-20T12:00:00Z'):YoutubeExistingVideo=>({
  id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus,publishAt,publishedAt,selected:false
});

describe('VYRON 4.0 owner-visible YouTube inventory',()=>{
  it('counts private owner-visible uploads even when public count is zero',()=>{
    const now=Date.parse('2026-09-28T08:00:00Z');
    const x=ownerInventoryFromVideos(channel,[video('private-1','private')],'2026-09-28T07:59:00Z',true,now);
    expect(x.totalOwnerVisible).toBe(1);
    expect(x.publicCount).toBe(0);
    expect(x.privateCount).toBe(1);
    expect(x.scheduledCount).toBe(0)
  });

  it('separates public private scheduled and unlisted without double counting',()=>{
    const now=Date.parse('2026-09-28T08:00:00Z');
    const rows=[
      video('public','public'),
      video('private','private'),
      video('scheduled','private','2026-10-08T12:00:00Z'),
      video('unlisted','unlisted')
    ];
    const x=ownerInventoryFromVideos(channel,rows,'2026-09-28T07:59:00Z',true,now);
    expect(x.totalOwnerVisible).toBe(4);
    expect(x.publicCount).toBe(1);
    expect(x.privateCount).toBe(1);
    expect(x.scheduledCount).toBe(1);
    expect(x.unlistedCount).toBe(1);
    expect(x.publishedCount).toBe(2);
    expect(x.nextScheduledAt).toBe('2026-10-08T12:00:00Z');
    expect(x.scheduledUntil).toBe('2026-10-08T12:00:00Z')
  });

  it('does not call a private upload scheduled when publishAt is missing or in the past',()=>{
    const now=Date.parse('2026-09-28T08:00:00Z');
    const rows=[video('a','private'),video('b','private','2026-09-20T12:00:00Z')];
    const x=ownerInventoryFromVideos(channel,rows,'2026-09-28T07:59:00Z',true,now);
    expect(x.privateCount).toBe(2);
    expect(x.scheduledCount).toBe(0)
  });

  it('uses cache TTL and never turns stale into fabricated zero',()=>{
    const now=Date.parse('2026-09-28T08:00:00Z');
    const fresh=ownerInventoryFromVideos(channel,[video('a','private')],new Date(now-OWNER_INVENTORY_TTL_MS+1000).toISOString(),true,now);
    const stale=ownerInventoryFromVideos(channel,[video('a','private')],new Date(now-OWNER_INVENTORY_TTL_MS-1000).toISOString(),true,now);
    expect(fresh.status).toBe('FRESH');
    expect(stale.status).toBe('CACHED');
    expect(stale.totalOwnerVisible).toBe(1)
  });

  it('owner inventory source never imports local Render inventory or reconnects OAuth automatically',()=>{
    const runtime=fs.readFileSync('src/youtubeOwnerInventory.ts','utf8');
    const scheduler=fs.readFileSync('src/YoutubeOwnerInventoryScheduler.tsx','utf8');
    expect(runtime).not.toContain('renderFolderPath');
    expect(runtime).not.toContain('scanRenderFolder');
    expect(runtime).not.toContain('youtubeDisconnect');
    expect(runtime).not.toContain('youtubeOauthConnect');
    expect(scheduler).not.toContain('youtubeOauthConnect');
    expect(scheduler).not.toContain('youtubeDisconnect')
  });
});
