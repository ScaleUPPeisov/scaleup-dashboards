import {describe,expect,it} from 'vitest';
import {aggregateActiveTaskProgress} from './taskProgress';
import type {PersistentTask} from './taskEngine';
const t=(id:string,completed?:number,total?:number,state:PersistentTask['state']='RUNNING'):PersistentTask=>({taskId:id,type:'RENDER_SCAN',state,completed,total,label:id,createdAt:'x',updatedAt:'x',retryState:'NONE'});
describe('aggregateActiveTaskProgress',()=>{
 it('uses real work units',()=>expect(aggregateActiveTaskProgress([t('a',20,100),t('b',50,100)]).percent).toBe(35));
 it('does not let indeterminate tasks corrupt measurable percentage',()=>{const x=aggregateActiveTaskProgress([t('a',20,100),t('b'),t('c',undefined,undefined,'QUEUED')]);expect(x.percent).toBe(20);expect(x.indeterminate).toBe(2)});
 it('does not include failed, cancelled or historical completed tasks',()=>expect(aggregateActiveTaskProgress([t('a',25,100),t('b',100,100,'SUCCEEDED'),t('c',0,100,'FAILED')]).percent).toBe(25));
});
