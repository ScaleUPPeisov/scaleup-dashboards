import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {beginPublishAttempt,completePublishAttempt,publisherDayKey,safeDailyStatus} from './youtubePublishSafety';

function memoryStorage(){
  const data=new Map<string,string>();
  return{
    getItem:(k:string)=>data.has(k)?data.get(k)!:null,
    setItem:(k:string,v:string)=>void data.set(k,String(v)),
    removeItem:(k:string)=>void data.delete(k),
    clear:()=>data.clear(),
    key:(i:number)=>[...data.keys()][i]??null,
    get length(){return data.size}
  } as Storage
}

describe('VYRON 4.0 per-channel local daily upload limiter',()=>{
  beforeEach(()=>{
    vi.stubGlobal('localStorage',memoryStorage());
    vi.setSystemTime(new Date('2026-09-28T03:00:00Z')); // 10:00 Krasnoyarsk
  });
  afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals()});

  it('uses Krasnoyarsk calendar day, not a rolling 24-hour window',()=>{
    expect(publisherDayKey(new Date('2026-09-27T16:59:59Z'))).toBe('2026-09-27');
    expect(publisherDayKey(new Date('2026-09-27T17:00:00Z'))).toBe('2026-09-28')
  });

  it('blocks the 11th factual upload when channel local limit is 10',()=>{
    for(let i=0;i<10;i++){
      const row=beginPublishAttempt({channelId:'c1',jobId:'j'+i,filePath:'/Render/'+i+'.mov',fingerprint:String(i).padStart(64,'a').slice(-64),fileSize:100+i});
      completePublishAttempt(row.id,'yt'+i)
    }
    const status=safeDailyStatus('c1',10,new Date());
    expect(status.used).toBe(10);
    expect(status.limit).toBe(10);
    expect(status.remaining).toBe(0);
    expect(status.source).toBe('VYRON_LOCAL_CHANNEL_LIMIT')
  });

  it('does not fabricate a limit when owner selected unlimited VYRON',()=>{
    const status=safeDailyStatus('c1',undefined,new Date());
    expect(status.configured).toBe(false);
    expect(status.limit).toBeUndefined();
    expect(status.remaining).toBeUndefined()
  });
});
