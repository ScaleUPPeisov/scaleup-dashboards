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

 it('decreases score when OAuth or updater fail and marks high quota usage yellow',()=>{
  const channel:any={id:'a',enabled:true,youtubeProfileId:'p',youtubeChannelId:'UC1',renderFolderPath:'/r'};
  const snap:any={channelId:'a',folderState:'ONLINE'};
  const healthyProfile:any={id:'p',channelId:'UC1',credentialStatus:'READY'};
  const badProfile:any={id:'p',channelId:'UC1',credentialStatus:'RECONNECT_REQUIRED'};
  const healthy=buildSystemHealth({channels:[channel],profiles:[healthyProfile],snapshots:{a:snap},jobs:[],updaterStatus:'UP_TO_DATE',workspace:'/x',endlumePath:'/e',booted:true,quotaUsed:100,quotaLimit:10000});
  const oauthFail=buildSystemHealth({channels:[channel],profiles:[badProfile],snapshots:{a:snap},jobs:[],updaterStatus:'UP_TO_DATE',workspace:'/x',endlumePath:'/e',booted:true,quotaUsed:100,quotaLimit:10000});
  const updaterFail=buildSystemHealth({channels:[channel],profiles:[healthyProfile],snapshots:{a:snap},jobs:[],updaterStatus:'ERROR',workspace:'/x',endlumePath:'/e',booted:true,quotaUsed:100,quotaLimit:10000});
  const quotaYellow=buildSystemHealth({channels:[channel],profiles:[healthyProfile],snapshots:{a:snap},jobs:[],updaterStatus:'UP_TO_DATE',workspace:'/x',endlumePath:'/e',booted:true,quotaUsed:6800,quotaLimit:10000});
  expect(oauthFail.score).toBeLessThan(healthy.score);
  expect(updaterFail.score).toBeLessThan(healthy.score);
  expect(quotaYellow.items.find(x=>x.id==='quota')?.state).toBe('YELLOW');
 });
});
