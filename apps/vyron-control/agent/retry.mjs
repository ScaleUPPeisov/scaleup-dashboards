// Independent retry budgets: a failing optional integration must not starve heartbeat/events.
// No credential values, URLs, request bodies or stack traces are stored in diagnostics.
const MAX=15*60_000;
export function diagnosticCode(error){
  const raw=String(error?.message||'');
  const status=Number(raw.match(/^Cloud HTTP (\d{3})$/)?.[1]);
  if(status===401||status===403)return 'AUTH_DENIED';
  if(status===429)return 'RATE_LIMIT';
  if(status===404)return 'ENDPOINT_MISSING';
  if(status>=500)return 'CLOUD_UNAVAILABLE';
  if(status>=400)return 'REQUEST_REJECTED';
  if(error?.name==='TimeoutError'||error?.name==='AbortError'||/timeout/i.test(raw))
    return 'NETWORK_TIMEOUT';
  if(/ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|fetch failed|Network failed/i.test(raw))
    return 'NETWORK_UNAVAILABLE';
  if(/ENOENT|mirror_missing|export_missing/i.test(raw))return 'STATE_NOT_READY';
  if(/JSON|Invalid/.test(raw))return 'STATE_INVALID';
  return 'SYNC_FAILED';
}
export class RetryBudget {
  constructor({now=()=>Date.now(),random=Math.random,base=15_000,cap=MAX}={}){
    this.now=now;this.random=random;this.base=base;this.cap=cap;
    this.state=new Map();
  }
  shouldRun(key){return this.now()>=(this.state.get(key)?.nextAt||0);}
  remainingMs(key){return Math.max(0,(this.state.get(key)?.nextAt||0)-this.now());}
  fail(key,error){
    const prev=this.state.get(key),attempts=Math.min(12,(prev?.attempts||0)+1);
    const code=diagnosticCode(error);
    const raw=Math.min(this.cap,this.base*2**(attempts-1));
    const delay=code==='AUTH_DENIED'?Math.max(raw,5*60_000):
      Math.max(this.base,Math.floor(raw*(0.9+this.random()*0.2)));
    const value={attempts,code,nextAt:this.now()+delay};
    this.state.set(key,value);
    return {...value,delay};
  }
  success(key){this.state.delete(key);}
  nextPendingMs(){
    const delays=[...this.state.values()].map(x=>Math.max(0,x.nextAt-this.now()));
    return delays.length?Math.min(...delays):0;
  }
}
