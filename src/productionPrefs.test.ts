import {beforeEach,describe,expect,it} from 'vitest';
import {defaultChannelProductionPrefs,patchChannelProductionPrefs,patchProductionPrefs,readProductionPrefs} from './productionPrefs';

class MemoryStorage {
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
  Object.defineProperty(globalThis,'CustomEvent',{value:class {detail:any;constructor(_t:string,init?:any){this.detail=init?.detail}},configurable:true});
});

describe('Production Manager v2 persistence',()=>{
  it('migrates current Production channel from v1 and persists tab/channel across reads',()=>{
    localStorage.setItem('vyron:production-workspace:v1',JSON.stringify({selectedChannelId:'neon'}));
    expect(readProductionPrefs().selectedChannelId).toBe('neon');
    patchProductionPrefs({selectedChannelId:'lost-highway',tab:'manager'});
    const reloaded=readProductionPrefs();
    expect(reloaded.selectedChannelId).toBe('lost-highway');
    expect(reloaded.tab).toBe('manager');
    expect(reloaded.version).toBe(2);
  });
  it('persists channel-specific builder settings and selected projects',()=>{
    expect(defaultChannelProductionPrefs().tracksPerProject).toBe(15);
    patchChannelProductionPrefs('neon',{projectCount:40,tracksPerProject:30,mode:'alphabetical',allowImageReuse:true,lastBatchId:'BATCH-14',selectedProjectIds:['001','003']});
    const p=readProductionPrefs().byChannel.neon;
    expect(p.projectCount).toBe(40);
    expect(p.tracksPerProject).toBe(30);
    expect(p.mode).toBe('alphabetical');
    expect(p.allowImageReuse).toBe(true);
    expect(p.lastBatchId).toBe('BATCH-14');
    expect(p.selectedProjectIds).toEqual(['001','003']);
  });
});
