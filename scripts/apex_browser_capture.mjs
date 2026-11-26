// Hosted Chromium only, disposable profile and loopback fixture. No native app.
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {once} from 'node:events';
const [packageDir,evidenceDir]=process.argv.slice(2).map(resolve);
await mkdir(evidenceDir,{recursive:true});
const temp=await mkdtemp(join(tmpdir(),'apex-chrome-'));
const routes=['dashboard','channels','production','inventory','publisher','batch','metadata','uploads','schedule','existing','runway','analytics','winners','competitors','images','music','autopilot','history','accounts','settings','design'];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const results=[],external=[],uncaught=[];
let server,chrome,ws,base;
let sequence=0;const pending=new Map();
async function until(fn,ms=15000){const stop=Date.now()+ms;while(Date.now()<stop){const x=await fn();if(x)return x;await sleep(100)}throw Error('Timed out waiting for browser evidence')}
function call(method,params={}){return new Promise((ok,fail)=>{const id=++sequence;const timeout=setTimeout(()=>{pending.delete(id);fail(Error(method+' timeout'))},10000);pending.set(id,{ok,fail,timeout});ws.send(JSON.stringify({id,method,params}))})}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error('Evaluation failed');return r.result.value}
try{
 server=spawn('python3',['scripts/apex_interactive_preview.py','--prebuilt','--no-browser'],{cwd:packageDir,stdio:['ignore','pipe','inherit']});
 let log='';server.stdout.on('data',x=>log+=x.toString());
 base=await until(()=>log.match(/APEX_FIXTURE_ONLY: (http:\/\/127\.0\.0\.1:\d+\/apex-interactive\.html)/)?.[1]);
 chrome=spawn('google-chrome',['--headless=new','--disable-gpu','--disable-background-networking','--disable-component-update','--disable-sync','--no-first-run','--no-default-browser-check','--remote-debugging-port=0','--user-data-dir='+temp,'--window-size=1440,900','about:blank'],{stdio:'ignore'});
 const port=await until(async()=>{try{return (await readFile(join(temp,'DevToolsActivePort'),'utf8')).split('\n')[0]}catch{return null}});
 const target=await (await fetch('http://127.0.0.1:'+port+'/json/new?about:blank',{method:'PUT'})).json();
 ws=new WebSocket(target.webSocketDebuggerUrl);
 await new Promise((ok,fail)=>{ws.addEventListener('open',ok,{once:true});ws.addEventListener('error',fail,{once:true})});
 ws.addEventListener('message',event=>{const m=JSON.parse(event.data);
  if(m.id&&pending.has(m.id)){const p=pending.get(m.id);pending.delete(m.id);clearTimeout(p.timeout);m.error?p.fail(Error(m.error.message)):p.ok(m.result)}
  if(m.method==='Runtime.exceptionThrown')uncaught.push(m.params.exceptionDetails.text);
  if(m.method==='Network.requestWillBeSent'){const url=m.params.request.url;if(/^https?:/.test(url)&&new URL(url).origin!==new URL(base).origin)external.push(url)}
 });
 await call('Page.enable');await call('Runtime.enable');await call('Network.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});
 await until(()=>evaluate('!!document.querySelector("[data-apex-page]")'));
 for(const route of routes){
  await evaluate('document.querySelector('+JSON.stringify('[data-apex-route="'+route+'"]')+').click()');
  await until(()=>evaluate('document.querySelector("[data-apex-page]")?.dataset.apexPage === '+JSON.stringify(route)));
  await sleep(300);
  const state=await evaluate('({error:!!document.querySelector(".uiErrorBoundary"),title:document.querySelector("[data-apex-page] h1, [data-apex-page] h2")?.textContent||"",text:(document.querySelector("[data-apex-page]")?.innerText||"").length})');
  const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
  await writeFile(join(evidenceDir,route+'.png'),Buffer.from(shot.data,'base64'));
  results.push({route,...state,pass:!state.error&&state.text>30});
 }
} catch(e){results.push({pass:false,error:String(e)})}
finally{
 if(ws)ws.close();
 for(const child of [chrome,server])if(child&&child.exitCode===null){child.kill();await Promise.race([once(child,'exit'),sleep(2000)]).catch(()=>{})}
 await rm(temp,{recursive:true,force:true});
 const ok=results.length===routes.length&&results.every(r=>r.pass)&&external.length===0&&uncaught.length===0;
 await writeFile(join(evidenceDir,'report.json'),JSON.stringify({ok,scope:'hosted Chromium synthetic navigation only',results,external,uncaught},null,2));
 if(!ok)process.exitCode=1;
}
