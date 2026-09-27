import {beforeEach,describe,it,expect} from 'vitest';
import {isYoutubeQuotaError,markYoutubeQuotaExceeded,youtubeQuotaState,youtubeQuotaUsage,recordYoutubeApiRequest} from './youtubeQuota';
import {setFrontendTenant,tenantStorageKey} from './tenantStorage';

class MemoryStorage{
  private data=new Map<string,string>();
  get length(){return this.data.size}
  clear(){this.data.clear()}
  getItem(k:string){return this.data.has(k)?this.data.get(k)!:null}
  key(i:number){return [...this.data.keys()][i]??null}
  removeItem(k:string){this.data.delete(k)}
  setItem(k:string,v:string){this.data.set(k,String(v))}
}
beforeEach(()=>{
  Object.defineProperty(globalThis,'localStorage',{value:new MemoryStorage(),configurable:true});
  Object.defineProperty(globalThis,'window',{value:{dispatchEvent:()=>true,addEventListener:()=>{},removeEventListener:()=>{}},configurable:true});
  setFrontendTenant('');
});

describe('YouTube quota guard',()=>{
  it('detects real quotaExceeded errors',()=>{
    expect(isYoutubeQuotaError(new Error('The request cannot be completed because you have exceeded your quota. [quotaExceeded]'))).toBe(true);
    expect(isYoutubeQuotaError('YOUTUBE_QUOTA_PAUSED: daily quota')).toBe(true);
  });
  it('does not classify ordinary YouTube errors as quota',()=>{
    expect(isYoutubeQuotaError(new Error('invalidPublishAt'))).toBe(false);
    expect(isYoutubeQuotaError(new Error('network timeout'))).toBe(false);
  });

  it('isolates quota usage and quota guard between Windows tenants',()=>{
    setFrontendTenant('tenant-a');
    recordYoutubeApiRequest({method:'channels.list',at:new Date().toISOString()});
    markYoutubeQuotaExceeded('quotaExceeded');
    expect(youtubeQuotaUsage().used).toBe(1);
    expect(youtubeQuotaState().blocked).toBe(true);

    setFrontendTenant('tenant-b');
    expect(youtubeQuotaUsage().used).toBe(0);
    expect(youtubeQuotaState().blocked).toBe(false);
    recordYoutubeApiRequest({method:'channels.list',at:new Date().toISOString()});
    expect(youtubeQuotaUsage().used).toBe(1);

    setFrontendTenant('tenant-a');
    expect(youtubeQuotaUsage().used).toBe(1);
    expect(youtubeQuotaState().blocked).toBe(true);
  });

  it('moves a legacy global quota ledger once into the active tenant',()=>{
    const legacy='vyron:youtube-quota-ledger:v3';
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    localStorage.setItem(legacy,JSON.stringify({version:4,ptDate:day,buckets:{general:{limit:10000,used:7,calls:7},search:{limit:100,used:0,calls:0}},uploadProjects:{}}));
    setFrontendTenant('tenant-first');
    expect(youtubeQuotaUsage().used).toBe(7);
    expect(localStorage.getItem(legacy)).toBeNull();
    expect(localStorage.getItem(tenantStorageKey(legacy))).not.toBeNull();

    setFrontendTenant('tenant-second');
    expect(youtubeQuotaUsage().used).toBe(0);
  });
});
