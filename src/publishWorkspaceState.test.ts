import {beforeEach,describe,expect,it} from 'vitest';
import {clearPublishWorkspace,loadPublishWorkspace,savePublishWorkspace} from './publishWorkspaceState';
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
  setFrontendTenant('');
});

describe('publish workspace tenant isolation',()=>{
  it('clears only the active tenant workspace and never writes the global key',()=>{
    setFrontendTenant('tenant-a');
    savePublishWorkspace('channel-1',{selectedIds:['a1']});
    savePublishWorkspace('channel-2',{selectedIds:['a2']});

    setFrontendTenant('tenant-b');
    savePublishWorkspace('channel-1',{selectedIds:['b1']});

    setFrontendTenant('tenant-a');
    clearPublishWorkspace('channel-1');
    expect(loadPublishWorkspace('channel-1').selectedIds).toEqual([]);
    expect(loadPublishWorkspace('channel-2').selectedIds).toEqual(['a2']);

    setFrontendTenant('tenant-b');
    expect(loadPublishWorkspace('channel-1').selectedIds).toEqual(['b1']);

    expect(localStorage.getItem('vyron:youtube-publish-workspaces:v2')).toBeNull();
    expect(localStorage.getItem(tenantStorageKey('vyron:youtube-publish-workspaces:v2'))).toContain('b1');
  });
});
