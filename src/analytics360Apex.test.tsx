import React from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import type {Channel} from './types';

const mock=vi.hoisted(()=>({invoke:vi.fn()}));
vi.mock('@tauri-apps/api/core',()=>({invoke:mock.invoke}));
import {Analytics360Winners} from './Analytics360Winners';

const channelId='UC1234567890123456789012';
const channel={id:'fixture',name:'Тестовый канал',youtubeChannelId:channelId} as Channel;

describe('APEX analytics winner workspace',()=>{
 afterEach(()=>{vi.unstubAllGlobals();mock.invoke.mockReset()});
 it('keeps unknown values, opens the selected video and expands results without refetching',async()=>{
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT',true);
  const items=Array.from({length:21},(_,i)=>({channelId,videoId:'video-'+i,title:'Ролик '+i,classification:'RISING',scoreStatus:'AVAILABLE',winnerScore:i===0?null:21-i,current7Views:i===0?null:100,previous7Views:0,anomalies:[]}));
  mock.invoke.mockResolvedValue({status:'AVAILABLE',source:'fixture',offlineApiRequests:0,videoWinners:items,videoAnomalies:[],channels:[],coverage:[{channelId,status:'AVAILABLE'}]});
  const onOpenVideo=vi.fn();
  // @ts-expect-error Test renderer has no bundled TypeScript declarations.
  const {act,create}=await import('react-test-renderer');
  let view:any;
  await act(async()=>{view=create(<Analytics360Winners channels={[channel]} onOpenVideo={onOpenVideo}/>);await Promise.resolve()});
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  expect(view.root.findAllByType('article').filter((x:any)=>x.props.className==='a360-winner-row')).toHaveLength(20);
  const more=view.root.findByProps({className:'a360-winners-more'});
  await act(async()=>more.props.onClick());
  const rows=view.root.findAllByType('article').filter((x:any)=>x.props.className==='a360-winner-row');
  expect(rows).toHaveLength(21);
  expect(rows[20].findAllByType('dd')[0].children).toEqual(['—']);
  await act(async()=>rows[0].findByType('button').props.onClick());
  expect(onOpenVideo).toHaveBeenCalledWith(channelId,'video-1');
  expect(mock.invoke).toHaveBeenCalledTimes(1);
  await act(async()=>view.unmount());
 });
});
