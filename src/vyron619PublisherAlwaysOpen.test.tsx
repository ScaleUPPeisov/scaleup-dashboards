import React from 'react';
import {beforeEach,describe,expect,it,vi} from 'vitest';

vi.mock('./api',()=>{
 const asyncEmpty=async()=>[];
 const api=new Proxy({} as Record<string,unknown>,{
  get(_target,key){
   if(key==='youtubeUploadSessions')return asyncEmpty;
   if(key==='localSourceStatus')return async()=>({exists:false,isFile:false});
   if(key==='youtubeProfiles')return asyncEmpty;
   if(key==='youtubeGoogleConfig')return async()=>({});
   if(key==='youtubeListExisting')return async()=>({videos:[],complete:true,scheduleComplete:true,draftCandidateCount:0});
   if(key==='discoverChannelFolders')return async()=>({render:[],projects:[]});
   return async()=>undefined;
  }
 });
 return{api};
});

function installBrowserStubs(){
 const values=new Map<string,string>();
 (globalThis as any).localStorage={
  getItem:(key:string)=>values.get(key)??null,
  setItem:(key:string,value:string)=>{values.set(key,String(value))},
  removeItem:(key:string)=>{values.delete(key)},
  clear:()=>values.clear(),
 };
 const listeners=new Map<string,Set<(...args:any[])=>void>>();
 const win:any=globalThis;
 win.window=win;
 win.addEventListener=(name:string,fn:(...args:any[])=>void)=>{const set=listeners.get(name)||new Set();set.add(fn);listeners.set(name,set)};
 win.removeEventListener=(name:string,fn:(...args:any[])=>void)=>listeners.get(name)?.delete(fn);
 win.dispatchEvent=()=>true;
 win.confirm=()=>true;
 win.prompt=()=>null;
 if(typeof win.CustomEvent!=='function')win.CustomEvent=class CustomEvent<T=unknown>{type:string;detail:T;constructor(type:string,init?:{detail?:T}){this.type=type;this.detail=init?.detail as T}};
}

function renderedText(renderer:any){return JSON.stringify(renderer.toJSON())}

const requiredSections=['Папки канала','Незавершённые загрузки','Метаданные','Обложки','Когда публиковать','Очистка'];
const controls=['folders','recovery','metadata','thumbs','schedule','cleanup'];

describe('VYRON 6.1.9 Publisher core sections are always open',()=>{
 beforeEach(()=>{installBrowserStubs();vi.resetModules()});

 it('cold mount renders all six working sections with zero clicks, including empty Recovery',async()=>{
  const {act,create}=await import('react-test-renderer');
  const {PublisherOS}=await import('./PublisherOS');
  let renderer:any;
  await act(async()=>{renderer=create(<PublisherOS/>)});
  const text=renderedText(renderer);
  for(const label of requiredSections)expect(text,label).toContain(label);
  expect(text).toContain('Незавершённых загрузок нет');
  renderer.unmount();
 });

 it('top controls cannot hide any core section',async()=>{
  const {act,create}=await import('react-test-renderer');
  const {PublisherOS}=await import('./PublisherOS');
  let renderer:any;
  await act(async()=>{renderer=create(<PublisherOS/>)});
  for(const control of controls){
   const button=renderer.root.findByProps({'data-publisher-control':control});
   await act(async()=>{button.props.onClick()});
   const text=renderedText(renderer);
   for(const label of requiredSections)expect(text,`${control} hid ${label}`).toContain(label);
  }
  renderer.unmount();
 });

 it('core section visibility is not controlled by x=>!x state toggles',async()=>{
  const {readFile}=await import('node:fs/promises');
  const source=await readFile(new URL('./PublisherOS.tsx',import.meta.url),'utf8');
  expect(source).not.toMatch(/set(?:Folders|Recovery|Metadata|Thumbnail|Schedule|Cleanup)Open\(\s*x\s*=>\s*!x\s*\)/);
 });
});