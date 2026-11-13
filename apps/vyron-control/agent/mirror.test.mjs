import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,stat,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import {join} from 'node:path';
import {MirrorExport,mirrorChannels,mirrorStatus,mirrorEvents,mirrorAnalytics} from './mirror.mjs';

function sampleState() {
  const id='UC'+('x'.repeat(22));
  return {
    version:10,
    settings:{youtubeApiKey:'AIza_SUPERSECRET',openaiApiKey:'sk_DO_NOT_SEND'},
    channels:[{
      id:'local-123',name:'Neon Drive FM',youtubeChannelId:id,
      youtubeProfileId:'private-profile-id',renderFolderPath:'/Volumes/SECRET',
      seo:{descriptionTemplate:'sensitive'},
    analytics:{periodDays:28,updatedAt:new Date().toISOString(),
      views:2000,watchMinutes:9000,averageViewDuration:180,
      averageViewPercentage:58.2,subscribersGained:55,subscribersLost:3,
      impressionCtr:5.3,impressions:40000,monetaryAuthorized:false,
      estimatedRevenue:150,
      refreshToken:'NEVER_SEND_REFRESH',
      daily:[{date:'2026-11-12',views:100,watchMinutes:500,
        subscribersGained:2,subscribersLost:1}]}
    },{id:'offline-456',name:'Unmapped channel',youtubeProfileId:'TOKEN'}],
    jobs:[
      {id:'job-1',status:'RENDERING',finalPath:'/Users/Private/video.mp4'},
      {id:'job-2',status:'READY_UPLOAD'},
      {id:'job-3',status:'UPLOADING'}
    ],
    uploadHistory:[{id:'uploaded',status:'UPLOADED',youtubeVideoId:'VID',localFilePath:'/Secret'}],
    activityJournal:[{
      eventId:'upload:job-3',timestamp:new Date().toISOString(),
      eventType:'UPLOAD_PROGRESS',status:'STARTED',
      channelId:'local-123',channelName:'Neon Drive FM',
      localSourcePath:'/Users/Secret/A.mp4',profileId:'private-profile-id',
      jobId:'job-3',details:{percent:50,refresh_token:'evil'},
      errorCode:'',source:'LIVE_OPERATION'
    },{
      eventId:'render-start-100',timestamp:new Date().toISOString(),
      eventType:'PRODUCTION_BUILD_STARTED',status:'STARTED',
      channelId:'local-123',
      details:{oauthToken:'SHOULD_NEVER_ESCAPE'}
    }]
  };
}
test('mirror mapping exports only public YouTube IDs, event allowlist, minimal counters',()=>{
  const src=sampleState();
  const channels=mirrorChannels(src);
  assert.equal(channels.length,1);
  assert.equal(channels[0].name,'Neon Drive FM');
  const status=mirrorStatus(src);
  assert.equal(status.rendersActive,1);
  assert.equal(status.uploadsQueued,2);
  assert.equal(status.uploadsCompleted,1);
  const analytics=mirrorAnalytics(src);
  assert.equal(analytics.length,1);
  assert.equal(analytics[0].views,2000);
  assert.equal(analytics[0].estimatedRevenue,null);
  assert.equal(analytics[0].impressionCtr,5.3);
  assert.equal(JSON.stringify(analytics).includes('NEVER_SEND_REFRESH'),false);
  const events=mirrorEvents(src);
  assert.equal(events.length,2);
  assert.equal(events[0].kind,'upload_progress');
  assert.equal(events[0].payload.percent,50);
  assert.equal(events[0].channelId,channels[0].id);
  const serialized=JSON.stringify({channels,status,events});
  for(const secret of ['AIza_SUPERSECRET','sk_DO_NOT_SEND','/Users/Secret','/Volumes/SECRET',
    'private-profile-id','refresh_token','oauthToken'])
    assert.equal(serialized.includes(secret),false,'Secret leaked: '+secret);
});
test('mirror disk export is idempotent, survives restart, and uses private permissions',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vyron-mirror-'));
  try {
    const mirrorFile=join(dir,'app-state.json'),outDir=join(dir,'export');
    const state=sampleState();
    await writeFile(mirrorFile,JSON.stringify(state));
    const first=new MirrorExport({mirrorFile,outDir});
    await first.initialize();
    let result=await first.refresh();
    assert.equal(result.events,2);
    assert.equal(result.channels,1);
    const before=await readFile(first.eventsFile,'utf8');
    assert.equal(before.trim().split('\n').length,2);
    assert.equal((await stat(first.eventsFile)).mode&0o777,0o600);
    assert.equal((await stat(first.channelsFile)).mode&0o777,0o600);
    assert.equal((await stat(first.cursorFile)).mode&0o777,0o600);
    await first.refresh();
    assert.equal(await readFile(first.eventsFile,'utf8'),before);
    const restarted=new MirrorExport({mirrorFile,outDir});
    await restarted.initialize();
    await restarted.refresh();
    assert.equal(await readFile(first.eventsFile,'utf8'),before);
    state.activityJournal.push({
      eventId:'new_upload_completed',timestamp:new Date().toISOString(),
      eventType:'UPLOAD_ACCEPTED',status:'SUCCESS',channelId:'local-123'
    });
    await writeFile(mirrorFile,JSON.stringify(state)+' ');
    result=await restarted.refresh();
    assert.equal(result.events,1);
    assert.equal((await readFile(first.eventsFile,'utf8')).trim().split('\n').length,3);
    assert.deepEqual(JSON.parse(await readFile(first.channelsFile,'utf8')).map(x=>x.id),
      ['UC'+'x'.repeat(22)]);
  }finally{await rm(dir,{recursive:true,force:true});}
});
test('mirror refuses corrupted state without overwriting exported last good data',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vyron-mirror-'));
  try {
    const mirrorFile=join(dir,'app-state.json'),outDir=join(dir,'export');
    const mirror=new MirrorExport({mirrorFile,outDir});
    await mirror.initialize();
    assert.equal((await mirror.refresh()).status,'mirror_missing');
    await writeFile(mirrorFile,'{"channels":[],"jobs":null}');
    await assert.rejects(()=>mirror.refresh(),/Invalid VYRON state mirror/);
  }finally{await rm(dir,{recursive:true,force:true});}
});
