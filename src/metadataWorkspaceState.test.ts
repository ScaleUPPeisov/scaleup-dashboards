import {beforeEach,describe,expect,it} from 'vitest';
import {appendMetadataHistory,clearMetadataDraft,loadMetadataDraft,loadMetadataHistory,saveMetadataDraft,type MetadataDraft,type MetadataOperationHistory} from './metadataWorkspaceState';
import {loadActivePublishChannel,saveActivePublishChannel} from './publishWorkspaceState';

const __storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 get length(){return __storage.size},
 clear(){__storage.clear()},
 getItem(key:string){return __storage.has(key)?__storage.get(key)!:null},
 key(index:number){return Array.from(__storage.keys())[index]??null},
 removeItem(key:string){__storage.delete(key)},
 setItem(key:string,value:string){__storage.set(key,String(value))},
}});

const video=(id:string)=>({id,position:1,title:id,description:'desc',tags:['tag'],categoryId:'10',privacyStatus:'private',selected:true});
const draft=(channel:string,paste:string):MetadataDraft=>({version:1,updatedAt:'2026-09-14T07:23:00.000Z',target:'youtube',rows:[{number:1,title:`${channel} title`,source:'GPT.txt'}],paste,order:'newest',filter:'private',docxStrict:false,start:'2026-09-15T18:00',cadence:2,scheduleMode:'auto',selectedVideos:[video(`${channel}-v1`)]});
const history=(channelId:string,status:'success'|'partial'|'failed'='success'):MetadataOperationHistory=>({version:1,operationId:`metadata:${channelId}:1`,at:'2026-09-14T07:24:00.000Z',channelId,channelName:channelId==='elara'?'ELARA':'Lost Highway FM',selectedVideoCount:1,changedVideoCount:status==='failed'?0:1,changedFields:['title','description','tags'],plannedQuota:153,actualQuota:153,status,backupPath:`/Backup/${channelId}.json`,metadataOk:status==='failed'?0:1,total:1,scheduleOk:0,scheduleTotal:0,failed:status==='failed'?1:0});

describe('Metadata channel-scoped draft and operation history',()=>{
 beforeEach(()=>localStorage.clear());
 it('restores raw, parsed and selected mapping state for ELARA after remount',()=>{saveMetadataDraft('elara',draft('elara','VIDEO 1\nELARA'));expect(loadMetadataDraft('elara')?.paste).toContain('ELARA');expect(loadMetadataDraft('elara')?.rows).toHaveLength(1);expect(loadMetadataDraft('elara')?.selectedVideos[0].id).toBe('elara-v1')});
 it('isolates ELARA and Lost Highway drafts',()=>{saveMetadataDraft('elara',draft('elara','ELARA'));saveMetadataDraft('lost',draft('lost','LOST'));expect(loadMetadataDraft('elara')?.paste).toBe('ELARA');expect(loadMetadataDraft('lost')?.paste).toBe('LOST')});
 it('clears only the active channel draft',()=>{saveMetadataDraft('elara',draft('elara','ELARA'));saveMetadataDraft('lost',draft('lost','LOST'));clearMetadataDraft('elara');expect(loadMetadataDraft('elara')).toBeUndefined();expect(loadMetadataDraft('lost')?.paste).toBe('LOST')});
 it('corrupted draft is safe',()=>{localStorage.setItem('vyron:metadata-draft:v1:elara','{bad json');expect(loadMetadataDraft('elara')).toBeUndefined()});
 it('uses the existing global active channel application context',()=>{saveActivePublishChannel('elara');expect(loadActivePublishChannel()).toBe('elara');saveActivePublishChannel('lost');expect(loadActivePublishChannel()).toBe('lost')});
 it('records factual successful history separately from draft',()=>{appendMetadataHistory(history('elara'));expect(loadMetadataHistory('elara')[0]).toMatchObject({channelName:'ELARA',changedVideoCount:1,status:'success',actualQuota:153});clearMetadataDraft('elara');expect(loadMetadataHistory('elara')).toHaveLength(1)});
 it('failure is never normalized to success and history is channel-scoped',()=>{appendMetadataHistory(history('elara','failed'));appendMetadataHistory(history('lost','partial'));expect(loadMetadataHistory('elara')[0].status).toBe('failed');expect(loadMetadataHistory('lost')[0].status).toBe('partial');expect(loadMetadataHistory('elara')[0].channelId).toBe('elara')});
 it('does not persist arbitrary OAuth or Keychain secret properties',()=>{const unsafe:any={...draft('elara','ELARA'),accessToken:'secret-access',refreshToken:'secret-refresh',clientSecret:'secret-client',selectedVideos:[{...video('v1'),oauthToken:'secret-oauth'}]};saveMetadataDraft('elara',unsafe);appendMetadataHistory({...history('elara'),refreshToken:'secret-refresh'} as any);const payload=[localStorage.getItem('vyron:metadata-draft:v1:elara'),localStorage.getItem('vyron:metadata-history:v1:elara')].join('\n');expect(payload).not.toContain('secret-access');expect(payload).not.toContain('secret-refresh');expect(payload).not.toContain('secret-client');expect(payload).not.toContain('secret-oauth')});
});
