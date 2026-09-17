import {beforeEach,describe,expect,it} from 'vitest';
import {clearMetadataDraft,loadMetadataDraft,metadataDraftStatusLabel,saveMetadataDraft,type MetadataDraft} from './metadataWorkspaceState';

const __storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{get length(){return __storage.size},clear(){__storage.clear()},getItem(k:string){return __storage.has(k)?__storage.get(k)!:null},key(i:number){return Array.from(__storage.keys())[i]??null},removeItem(k:string){__storage.delete(k)},setItem(k:string,v:string){__storage.set(k,String(v))}}});
const draft=(channel:string):MetadataDraft=>({version:1,updatedAt:'2026-09-14T07:23:00.000Z',target:'youtube',rows:[{number:1,title:`${channel} title`,source:'GPT.txt'}],paste:`VIDEO 1 ${channel}`,order:'newest',filter:'private',docxStrict:false,start:'2026-09-15T18:00',cadence:2,scheduleMode:'auto',selectedVideos:[{id:`${channel}-v1`,position:1,title:'Video',description:'',tags:[],categoryId:'10',privacyStatus:'private',selected:true}]});

describe('VYRON 2.1.5 Metadata Draft Manager',()=>{
 beforeEach(()=>localStorage.clear());
 it('TEST 9/14 — status text is truthful: unsaved never says saved',()=>{expect(metadataDraftStatusLabel('unsaved',true)).toBe('Сохранение…');expect(metadataDraftStatusLabel('saved',true)).toBe('Черновик сохранён');expect(metadataDraftStatusLabel('restored',true)).toBe('Черновик восстановлен');expect(metadataDraftStatusLabel('completed',false)).toContain('Операция завершена')});
 it('TEST 10 — saved draft survives navigation/remount storage round-trip',()=>{saveMetadataDraft('elara',draft('ELARA'));expect(loadMetadataDraft('elara')?.rows[0].title).toBe('ELARA title');expect(loadMetadataDraft('elara')?.selectedVideos[0].id).toBe('ELARA-v1')});
 it('TEST 11/12 — ELARA and Lost Highway are isolated and clear affects current only',()=>{saveMetadataDraft('elara',draft('ELARA'));saveMetadataDraft('lost',draft('LOST'));clearMetadataDraft('elara');expect(loadMetadataDraft('elara')).toBeUndefined();expect(loadMetadataDraft('lost')?.paste).toContain('LOST')});
 it('TEST 13 — corrupted draft stays safe',()=>{localStorage.setItem('vyron:metadata-draft:v1:elara','{bad');expect(loadMetadataDraft('elara')).toBeUndefined()});
});
