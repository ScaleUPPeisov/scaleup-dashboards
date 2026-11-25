import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,it,expect,vi} from 'vitest';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';

const f=vi.hoisted(()=>{
 const channel=(id:string,name:string)=>({id,name,enabled:true,cadenceDays:2,targetBufferDays:60,publishHour:4,publishMinute:0,minTracks:10,targetDurationMin:120,seo:{titlePatterns:[],descriptionTemplate:'',tags:[],banned:[]}});
 return {state:{channels:[channel('fixture-a','Северное сияние'),channel('fixture-b','Фон для работы'),channel('fixture-c','Ночной город')],jobs:[],logs:[],settings:{workspace:'/Тестовые данные/Рабочая папка',vyronRootPath:'',projectsRootPath:'',renderRootPath:'',autopilotMode:'off',estimatedRpmUsd:2.5,autoCheckUpdates:false,endlumePath:'',youtubeApiKey:'',youtubeCategoryId:'10'},patchSettings:()=>{},setPage:()=>{}}};
});
vi.mock('./store',()=>({useApp:Object.assign((select:(state:unknown)=>unknown)=>select(f.state),{getState:()=>f.state,subscribe:()=>()=>{}})}));
vi.mock('./api',()=>({api:new Proxy({}, {get:()=>()=>{throw new Error('IPC запрещён в статическом превью')}})}));
vi.mock('./channelRunwayStore',()=>({loadChannelRunwayStore:()=>({channels:{'fixture-a':{channelId:'fixture-a',channelName:'Северное сияние',status:'urgent',runwayDays:9},'fixture-b':{channelId:'fixture-b',channelName:'Фон для работы',status:'prepare',runwayDays:28},'fixture-c':{channelId:'fixture-c',channelName:'Ночной город',status:'large',runwayDays:72}}}),subscribeChannelRunway:()=>()=>{}}));
vi.mock('./productionPrefs',()=>({defaultChannelProductionPrefs:()=>({projectCount:20}),useProductionPrefs:()=>[{byChannel:{},projectCount:20},()=>{}]}));
vi.mock('./youtubeQuota',()=>({resetYoutubeUploadQuotaLimit:()=>{},setYoutubeUploadQuotaLimit:()=>{},subscribeYoutubeQuota:()=>()=>{},subscribeYoutubeQuotaClock:()=>()=>{},youtubeQuotaClockSnapshot:()=>({}),youtubeQuotaProjectIdentity:()=>({projectKey:'',label:'нет данных'}),youtubeQuotaTrace:()=>[],youtubeQuotaUsage:()=>({limit:0,used:0}),youtubeUploadQuotaState:()=>({limit:null,limitSource:'unknown',used:0,reserved:0})}));
vi.mock('@tauri-apps/api/core',()=>({invoke:()=>{throw new Error('IPC запрещён в статическом превью')},convertFileSrc:()=>''}));

const enabled=(globalThis as {process?:{env?:Record<string,string|undefined>}}).process?.env?.APEX_CAPTURE_FIXTURES==='1';
describe('isolated static component previews',()=>{
 afterEach(()=>vi.unstubAllGlobals());
 it.skipIf(!enabled)('renders fixture-only HTML without browser scripts or application services',async()=>{
  const memory=new Map<string,string>();
  vi.stubGlobal('localStorage',{getItem:(k:string)=>memory.get(k)||null,setItem:(k:string,v:string)=>memory.set(k,String(v)),removeItem:(k:string)=>memory.delete(k)});
  vi.stubGlobal('fetch',()=>{throw new Error('Сеть запрещена в статическом превью')});
  const {SettingsOS}=await import('./SettingsOS');
  const {CommandCenter}=await import('./CommandCenter');
  const files=['styles.css','v060.css','v070.css','v080.css','v081.css','v090.css','v095.css','production-manager.css','updater-ui.css','v216.css','ui-layout-contract.css','live-inventory.css','v400-celebration.css','youtube-apex.css','apex-tokens.css','settings-apex.css','command-center-apex.css'];
  const css=files.map(x=>readFileSync(resolve('src',x),'utf8')).join('\n');
  expect(css).not.toMatch(/@import|url\(\s*['"]?(?:https?:|\/\/)/i);
  const output=resolve('../apex-preview');mkdirSync(output,{recursive:true});
  const make=(title:string,body:string)=>`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"><title>${title} — тестовые данные</title><style>${css}\nbody{margin:0;padding:28px;background:#121218;color:#f2f0fa;font-family:-apple-system,BlinkMacSystemFont,sans-serif}.fixtureBanner{position:sticky;top:0;z-index:9999;margin-bottom:18px;padding:12px 16px;background:#48366c;color:#fff;border:1px solid #bba6f5;border-radius:10px;font-weight:700}.fixtureBody{max-width:1500px;margin:auto}</style></head><body><div class="fixtureBanner">ТЕСТОВЫЕ ДАННЫЕ · СТАТИЧНЫЙ МАКЕТ · КНОПКИ НЕ РАБОТАЮТ</div><main class="fixtureBody">${body}</main></body></html>`;
  const settings=renderToStaticMarkup(<SettingsOS license={{valid:true,type:'development'} as any}/>);
  const command=renderToStaticMarkup(<CommandCenter/>);
  expect(settings).toContain('Настройки');expect(command).toContain('КОМАНДНЫЙ ЦЕНТР');
  writeFileSync(resolve(output,'settings.html'),make('Настройки',settings));
  writeFileSync(resolve(output,'command-center.html'),make('Командный центр',command));
 });
});
