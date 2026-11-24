import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import type {AppNotification} from './notificationCenter';
import {createNotificationToastQueue} from './notificationToastQueue';

const notice=(id:string,patch:Partial<AppNotification>={}):AppNotification=>({id,operationId:id,type:'info',title:'Уведомление',message:id,durationMs:8000,actions:[],createdAt:0,...patch});

describe('notification presentation queue',()=>{
 beforeEach(()=>{vi.useFakeTimers();vi.setSystemTime(10_000)});
 afterEach(()=>vi.useRealTimers());
 it('limits visible to two, rate limits promotion and retains the remaining queue',async()=>{
  const snapshots:AppNotification[][]=[];const q=createNotificationToastQueue(x=>snapshots.push(x));
  for(let i=0;i<5;i++)q.enqueue(notice(String(i)));
  await vi.advanceTimersByTimeAsync(100);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['0']);
  await vi.advanceTimersByTimeAsync(350);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['0','1']);
  q.close('0');await vi.advanceTimersByTimeAsync(350);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['1','2']);
  q.close('1');await vi.advanceTimersByTimeAsync(350);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['2','3']);
  q.close('2');await vi.advanceTimersByTimeAsync(350);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['3','4']);
  expect(snapshots.every(x=>x.length<=2)).toBe(true);q.dispose();
 });
 it('groups explicit render events while avoiding duplicate operation ids',async()=>{
  const snapshots:AppNotification[][]=[];const q=createNotificationToastQueue(x=>snapshots.push(x));
  for(let i=0;i<100;i++)q.enqueue(notice(String(i),{groupKey:'render-safe-clean:channel-a',title:'РЕНДЕР ГОТОВ'}));
  q.enqueue(notice('duplicate',{operationId:'7',groupKey:'render-safe-clean:channel-a',title:'РЕНДЕР ГОТОВ'}));
  await vi.advanceTimersByTimeAsync(100);
  expect(snapshots).toHaveLength(1);expect(snapshots[0]).toHaveLength(1);expect(snapshots[0][0].groupCount).toBe(100);
  q.dispose();
 });
 it('sums project counts across same-channel batches but separates different channels',async()=>{
  const snapshots:AppNotification[][]=[];const q=createNotificationToastQueue(x=>snapshots.push(x));
  q.enqueue(notice('a',{groupKey:'render-safe-clean:a',groupCount:4,groupLabel:'Канал A'}));
  q.enqueue(notice('b',{groupKey:'render-safe-clean:a',groupCount:3,groupLabel:'Канал A'}));
  q.enqueue(notice('c',{groupKey:'render-safe-clean:b',groupCount:2,groupLabel:'Канал B'}));
  await vi.advanceTimersByTimeAsync(450);
  expect(snapshots.at(-1)).toHaveLength(2);
  expect(snapshots.at(-1)?.[0]).toMatchObject({groupCount:7,groupEntries:2,groupLabel:'Канал A'});
  expect(snapshots.at(-1)?.[1]).toMatchObject({groupCount:2,groupLabel:'Канал B'});q.dispose();
 });
 it('does not group critical messages or notifications with project-specific actions',async()=>{
  const snapshots:AppNotification[][]=[];const q=createNotificationToastQueue(x=>snapshots.push(x));
  const action=vi.fn();
  q.enqueue(notice('a',{groupKey:'render',actions:[{label:'Открыть',onClick:action}]}));
  q.enqueue(notice('b',{groupKey:'render',actions:[{label:'Открыть',onClick:action}]}));
  q.enqueue(notice('error-a',{type:'error',groupKey:'render',durationMs:null}));
  q.enqueue(notice('error-b',{type:'error',groupKey:'render',durationMs:null}));
  await vi.advanceTimersByTimeAsync(450);
  expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['a','error-a']);
  q.close('a');await vi.advanceTimersByTimeAsync(350);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['error-a','error-b']);
  q.close('error-a');await vi.advanceTimersByTimeAsync(350);expect(snapshots.at(-1)?.map(x=>x.id)).toEqual(['error-b','b']);
  expect(snapshots.at(-1)?.find(x=>x.id==='b')?.actions).toHaveLength(1);q.dispose();
 });
 it('keeps distinct critical messages even when their operation ids match',async()=>{
  const snapshots:AppNotification[][]=[];const q=createNotificationToastQueue(x=>snapshots.push(x));
  q.enqueue(notice('e1',{operationId:'same',type:'error',title:'Ошибка 1',durationMs:null}));
  q.enqueue(notice('e2',{operationId:'same',type:'error',title:'Ошибка 2',durationMs:null}));
  await vi.advanceTimersByTimeAsync(450);
  expect(snapshots.at(-1)?.map(x=>x.title)).toEqual(['Ошибка 1','Ошибка 2']);q.dispose();
 });
 it('replaces a single operation toast without multiplying it and cancels timers on dispose',async()=>{
  const publish=vi.fn();const q=createNotificationToastQueue(publish);
  q.enqueue(notice('old',{operationId:'job'}));q.enqueue(notice('new',{operationId:'job',message:'готово'}));
  await vi.advanceTimersByTimeAsync(100);expect(publish).toHaveBeenCalledTimes(1);
  expect(publish.mock.calls[0][0]).toMatchObject([{id:'new',message:'готово'}]);
  q.enqueue(notice('queued'));q.dispose();await vi.advanceTimersByTimeAsync(2000);expect(publish).toHaveBeenCalledTimes(1);
 });
});
