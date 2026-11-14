import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MacBridge } from './bridge.mjs';
import { cleanEvent, cleanStatus, checkRemoteCommand } from './logic.mjs';

test('private Mac agent sends heartbeat and redacted events, persists cursor',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vyron-bridge-'));
  try{
    const eventsFile=join(dir,'history.jsonl'),statusFile=join(dir,'status.json');
    const cursorFile=join(dir,'cursor.json');
    const line=JSON.stringify({
      id:'render_complete_test_2026',kind:'render_completed',
      occurredAt:new Date().toISOString(),title:'Render complete',
      payload:{projectId:'abc',bytesProcessed:123,accessToken:'SECRET_SHOULD_NEVER_BE_SENT'}
    })+'\n';
    await writeFile(eventsFile,line);
    await writeFile(statusFile,JSON.stringify({
      rendersActive:2,uploadsQueued:9,refreshToken:'SECRET',
      vyronVersion:'6.1.15'
    }));
    const sent=[];
    const fetchImpl=async(url,opts)=>{
      const payload=opts.body?JSON.parse(opts.body):null;
      sent.push({url,payload});
      if(url.endsWith('/api/agent/commands?device=macbook_m1'))
        return {ok:true,json:async()=>({commands:[]})};
      return {ok:true,json:async()=>({received:1})};
    };
    const args={url:'https://control.example',token:'T'.repeat(40),
      eventsFile,statusFile,cursorFile,fetchImpl};
    const agent=new MacBridge(args);
    await agent.initialize();
    await agent.tick();
    assert.equal(sent.length,3);
    assert.equal(sent[0].payload.status.refreshToken,undefined);
    assert.equal(sent[0].payload.status.macAwake,true);
    assert.equal(sent[1].payload.events[0].payload.accessToken,undefined);
    assert.equal(sent[1].payload.events[0].payload.projectId,'abc');
    assert.equal(JSON.parse(await readFile(cursorFile,'utf8')).offset,Buffer.byteLength(line));
    const again=new MacBridge(args);
    await again.initialize();
    await again.tick();
    assert.equal(sent.filter(v=>v.url.endsWith('/api/agent/events')).length,1);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('failed network leaves durable cursor unchanged for retry',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vyron-bridge-'));
  try {
    const eventsFile=join(dir,'events.jsonl'),cursorFile=join(dir,'cursor.json');
    await writeFile(eventsFile,JSON.stringify({
      id:'upload_started_000001',kind:'upload_started',
      title:'Upload started',occurredAt:new Date().toISOString()
    })+'\n');
    const agent=new MacBridge({
      url:'https://control.example',token:'A'.repeat(40),eventsFile,cursorFile,
      fetchImpl:async()=>{throw new Error('Network failed');}
    });
    await assert.rejects(()=>agent.syncEvents(),/Network failed/);
    assert.equal(agent.offset,0);
    await assert.rejects(()=>readFile(cursorFile,'utf8'),{code:'ENOENT'});
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('Mac bridge does not cache a registry until the first public sync completes',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vyron-channel-retry-'));
  try {
    const channelsFile=join(dir,'channels.json');
    await writeFile(channelsFile,JSON.stringify([
      {id:'UC'+('9'.repeat(22)),name:'New channel'}
    ]));
    let attempts=0;
    const bridge=new MacBridge({
      url:'https://control.example',token:'T'.repeat(40),channelsFile,
      fetchImpl:async()=>{
        attempts++;
        return {ok:true,json:async()=>attempts===1
          ?{enrolled:1,publicSync:{complete:false,reason:'initial_sync_failed'}}
          :{enrolled:1,publicSync:{complete:true,updatedChannels:1,requestedChannels:1}}};
      }
    });
    assert.equal((await bridge.syncChannelRegistry()).reason,'initial_sync_pending');
    assert.equal(bridge.lastChannelHash,null);
    bridge.lastChannelSyncAttemptAt=0;
    const recovered=await bridge.syncChannelRegistry();
    assert.equal(recovered.imported,1);
    assert.ok(bridge.lastChannelHash);
    assert.equal(attempts,2);
  }finally{await rm(dir,{recursive:true,force:true});}
});

test('bridge rejects unsafe remote commands',()=>{
  assert.deepEqual(checkRemoteCommand({kind:'request_status'}),{supported:true});
  for(const kind of ['publish_video','remote_update','delete_file','resume_publisher']){
    assert.deepEqual(checkRemoteCommand({kind}),{supported:false});
  }
  assert.throws(()=>new MacBridge({url:'http://unsafe',token:'A'.repeat(40)}));
  assert.deepEqual(cleanStatus({rendersActive:3,oauthSecret:'SHH'}),{
    rendersActive:3,macAwake:true
  });
  assert.equal(cleanEvent({kind:'unapproved',occurredAt:new Date().toISOString()},'macbook_m1',0),null);
});

test('Mac agent bulk-imports exported YouTube channel registry once per change',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'vyron-channels-'));
  try {
    const channelsFile=join(dir,'channels.json');
    const list=Array.from({length:33},(_,i)=>({
      channelId:'UC'+String(i).padStart(22,'0'),title:'Channel '+i,
      ...(i===0?{profileBinding:'a'.repeat(64)}:{})
    }));
    await writeFile(channelsFile,JSON.stringify({channels:list}));
    const sent=[];
    const bridge=new MacBridge({
      url:'https://control.example',token:'T'.repeat(40),channelsFile,
      fetchImpl:async(url,opts)=>{
        sent.push({url,body:JSON.parse(opts.body)});
        return {ok:true,json:async()=>({enrolled:33})};
      }
    });
    assert.equal((await bridge.syncChannelRegistry()).imported,33);
    assert.equal(sent.length,1);
    assert.equal(sent[0].body.length,33);
    assert.equal(sent[0].body[0].id,list[0].channelId);
    assert.equal(sent[0].body[0].profileBinding,'a'.repeat(64));
    assert.equal((await bridge.syncChannelRegistry()).reason,'unchanged');
    assert.equal(sent.length,1);
    list[0].title='Renamed channel';
    await writeFile(channelsFile,JSON.stringify({channels:list}));
    assert.equal((await bridge.syncChannelRegistry()).imported,33);
    assert.equal(sent.length,2);
    assert.equal(sent[1].body[0].name,'Renamed channel');
  }finally{await rm(dir,{recursive:true,force:true});}
});
