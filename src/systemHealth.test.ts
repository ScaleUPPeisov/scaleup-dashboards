import {describe,expect,it} from 'vitest';
import {buildSystemHealth} from './systemHealth';
describe('VYRON 5 system health',()=>{
 it('does not mark unknown quota as green',()=>{
  const h=buildSystemHealth({channels:[],profiles:[],snapshots:{},jobs:[],updaterStatus:'UP_TO_DATE',workspace:'/x',endlumePath:'',booted:true});
  expect(h.items.find(x=>x.id==='quota')?.state).toBe('GRAY');
 });
 it('marks a broken configured render folder red',()=>{
  const channel:any={id:'a',enabled:true,renderFolderPath:'/disk/a'};
  const snapshot:any={channelId:'a',folderState:'OFFLINE'};
  const h=buildSystemHealth({channels:[channel],profiles:[],snapshots:{a:snapshot},jobs:[],updaterStatus:'UP_TO_DATE',workspace:'/x',endlumePath:'/endlume',booted:true,quotaUsed:10,quotaLimit:10000});
  expect(h.items.find(x=>x.id==='render')?.state).toBe('RED');
 });
});
