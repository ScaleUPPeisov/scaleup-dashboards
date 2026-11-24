import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {clearNotificationHistory,notify,readNotificationHistory,subscribeNotifications} from './notificationCenter';
import {readErrorHistory} from './errorHistory';
import {createNotificationToastQueue} from './notificationToastQueue';
import type {AppNotification} from './notificationCenter';

describe('notification presentation and history',()=>{
 let data:Map<string,string>;
 beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(50_000);data=new Map();
  vi.stubGlobal('window',new EventTarget());
  vi.stubGlobal('localStorage',{getItem:(key:string)=>data.get(key)??null,setItem:vi.fn((key:string,value:string)=>data.set(key,value)),removeItem:(key:string)=>data.delete(key)});
  if(typeof globalThis.CustomEvent==='undefined')vi.stubGlobal('CustomEvent',class<T> extends Event{detail:T|undefined;constructor(name:string,options?:{detail?:T}){super(name);this.detail=options?.detail}});
  clearNotificationHistory();
 });
 afterEach(()=>{clearNotificationHistory();vi.useRealTimers();vi.unstubAllGlobals()});
 it('keeps individual history records while grouping a burst of safe render events',async()=>{
  const snapshots:AppNotification[][]=[];const queue=createNotificationToastQueue(x=>snapshots.push(x));
  const off=subscribeNotifications(queue.enqueue);
  for(let i=0;i<12;i++)notify('info','РЕНДЕР ГОТОВ',`project ${i}`,{operationId:`project-${i}`,groupKey:'render-safe-clean:channel-a'});
  expect(readNotificationHistory()).toHaveLength(12);
  await vi.advanceTimersByTimeAsync(100);
  expect(snapshots.at(-1)).toHaveLength(1);expect(snapshots.at(-1)?.[0].groupCount).toBe(12);
  expect(localStorage.setItem).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(100);
  expect(localStorage.setItem).toHaveBeenCalledTimes(1);
  expect(JSON.parse(data.get('vyron:notification-history:v1')||'[]')).toHaveLength(12);
  off();queue.dispose();clearNotificationHistory();
 });
 it('flushes every pending informational record on pagehide',()=>{
  for(let i=0;i<6;i++)notify('info','Готово',`Проект ${i}`,{operationId:`p-${i}`});
  expect(data.has('vyron:notification-history:v1')).toBe(false);
  window.dispatchEvent(new Event('pagehide'));
  expect(JSON.parse(data.get('vyron:notification-history:v1')||'[]')).toHaveLength(6);
  expect(vi.getTimerCount()).toBe(0);
 });
 it('restores flushed history after a fresh module load',async()=>{
  notify('success','Готово','Первый проект',{operationId:'one'});
  notify('info','Готово','Второй проект',{operationId:'two'});
  window.dispatchEvent(new Event('beforeunload'));
  vi.resetModules();
  const fresh=await import('./notificationCenter');
  expect(fresh.readNotificationHistory().map(x=>x.operationId)).toEqual(['two','one']);
 });
 it('records each distinct critical error immediately, independently of the visible queue',()=>{
  const queue=createNotificationToastQueue(()=>{});const off=subscribeNotifications(queue.enqueue);
  for(let i=0;i<4;i++)notify('error',`Ошибка ${i}`,`Сбой ${i}`,{operationId:`error-${i}`});
  expect(readNotificationHistory()).toHaveLength(4);
  expect(readErrorHistory()).toHaveLength(4);
  expect(JSON.parse(data.get('vyron:error-history:v1')||'[]')).toHaveLength(4);
  off();queue.dispose();
 });
});
