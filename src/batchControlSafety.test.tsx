import React from 'react';
import {beforeEach,afterEach,describe,expect,it,vi} from 'vitest';

const h=vi.hoisted(()=>({state:{} as any,enqueue:vi.fn(),fingerprint:vi.fn(),status:vi.fn(),warn:vi.fn()}));
vi.mock('./store',()=>({useApp:Object.assign((select:any)=>select(h.state),{getState:()=>h.state})}));
vi.mock('./ModalPortal',()=>({ModalPortal:({children}:any)=>children}));
vi.mock('./api',()=>({api:{youtubeProfiles:async()=>[{id:'p1',channelId:'yt1'}],youtubeGoogleConfig:async()=>null,localSourceStatus:h.status,youtubeFileFingerprint:h.fingerprint}}));
vi.mock('./renderInventoryRuntime',()=>({scanInventoryChannel:vi.fn()}));
vi.mock('./youtubeOwnerInventory',()=>({ownerInventoryForChannel:()=>({available:false}),refreshStaleOwnerInventories:vi.fn()}));
vi.mock('./youtubeChannelStatsRuntime',()=>({refreshYoutubeChannelStatisticsSelection:vi.fn()}));
vi.mock('./uploadQueueRuntime',()=>({configureUploadQueue:vi.fn(),enqueueUpload:h.enqueue,uploadQueueHasActiveJob:()=>false}));
vi.mock('./youtubePublishSafety',()=>({globalDailyUploadStatus:()=>({remaining:10}),safeDailyStatus:()=>({remaining:10})}));
vi.mock('./youtubeQuota',()=>({youtubeQuotaProjectIdentity:()=>({projectKey:'test'})}));
vi.mock('./notificationCenter',()=>({notifyError:vi.fn(),notifyInfo:vi.fn(),notifySuccess:vi.fn(),notifyWarning:h.warn}));
import {BatchControl} from './BatchControl';

const job={id:'j1',channelId:'c1',number:1,status:'READY_UPLOAD',finalPath:'/test/video.mp4',title:'Synthetic title',description:'Synthetic description',tags:['test'],publishAt:'2099-01-01T00:00:00Z'};
let view:any,act:any;
const button=(label:string)=>view.root.findAllByType('button').find((x:any)=>String(x.children.join('')).includes(label));
async function setup(){
 // @ts-expect-error react-test-renderer has no bundled type declarations
 const renderer=await import('react-test-renderer');act=renderer.act;
 await act(async()=>{view=renderer.create(<BatchControl/>)});
 await act(async()=>button('Открыть').props.onClick());
 await act(async()=>button('Выбрать все').props.onClick());
 await act(async()=>button('Добавить в очередь ·').props.onClick());
}
async function confirm(){
 const inputs=view.root.findAllByType('input');const confirmation=inputs[inputs.length-1];
 await act(async()=>confirmation.props.onChange({target:{checked:true}}));
 await act(async()=>{button('Подтвердить загрузку').props.onClick();await Promise.resolve();await Promise.resolve()});
}
describe('mass upload confirmation',()=>{
 beforeEach(()=>{vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);vi.clearAllMocks();h.state={channels:[{id:'c1',name:'Test',enabled:true,youtubeProfileId:'p1',youtubeChannelId:'yt1'}],jobs:[{...job,tags:[...job.tags]}],settings:{},fingerprintCache:{},patchJob:vi.fn()};h.status.mockResolvedValue({exists:true,isFile:true});h.fingerprint.mockResolvedValue({fingerprint:'a'.repeat(64),size:100,modifiedAt:1})});
 afterEach(async()=>{if(view)await act(async()=>view.unmount());view=undefined;vi.unstubAllGlobals()});
 it('does not access files or enqueue after cancellation or an unchecked confirmation',async()=>{
  await setup();const submit=button('Подтвердить загрузку');expect(submit.props.disabled).toBe(true);
  await act(async()=>submit.props.onClick());expect(h.status).not.toHaveBeenCalled();expect(h.enqueue).not.toHaveBeenCalled();
  await act(async()=>button('Отмена').props.onClick());expect(h.status).not.toHaveBeenCalled();expect(h.enqueue).not.toHaveBeenCalled();
 });
 it('enqueues the confirmed synthetic job exactly once',async()=>{
  await setup();await confirm();expect(h.enqueue).toHaveBeenCalledTimes(1);expect(h.enqueue.mock.calls[0][0]).toMatchObject({jobId:'j1',channelId:'c1',profileId:'p1',filePath:'/test/video.mp4'});
 });
 it('does not add a new job that became ready after the preview',async()=>{
  await setup();h.state.jobs=[...h.state.jobs,{...job,id:'j2',number:2,finalPath:'/test/other.mp4'}];await act(async()=>view.update(<BatchControl/>));
  await confirm();expect(h.enqueue).toHaveBeenCalledTimes(1);expect(h.enqueue.mock.calls[0][0].jobId).toBe('j1');
 });
 it('refuses a channel disabled during asynchronous fingerprinting',async()=>{
  let release!:(value:any)=>void;h.fingerprint.mockImplementation(()=>new Promise(resolve=>{release=resolve}));
  await setup();await confirm();h.state.channels=[{...h.state.channels[0],enabled:false}];
  await act(async()=>{release({fingerprint:'a'.repeat(64),size:100,modifiedAt:1});await Promise.resolve();await Promise.resolve()});
  expect(h.enqueue).not.toHaveBeenCalled();expect(h.warn).toHaveBeenCalled();
 });
 it('refuses a changed channel mapping after asynchronous fingerprinting',async()=>{
  let release!:(value:any)=>void;h.fingerprint.mockImplementation(()=>new Promise(resolve=>{release=resolve}));
  await setup();await confirm();h.state.channels=[{...h.state.channels[0],youtubeChannelId:'changed'}];
  await act(async()=>{release({fingerprint:'a'.repeat(64),size:100,modifiedAt:1});await Promise.resolve();await Promise.resolve()});
  expect(h.enqueue).not.toHaveBeenCalled();expect(h.warn).toHaveBeenCalled();
 });
});
