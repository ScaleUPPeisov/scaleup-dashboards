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
