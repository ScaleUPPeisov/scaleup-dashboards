// TEST-ONLY desktop distribution. Never loads production native code or user data.
const {app,BrowserWindow,protocol,session}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const origin='apex-fixture://preview';
const entry=origin+'/apex-interactive.html';
const test=process.argv.includes('--self-test');
const routes=['dashboard','channels','production','inventory','publisher','batch','metadata','uploads','schedule','existing','runway','analytics','winners','competitors','images','music','autopilot','history','accounts','settings','design'];
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'vyron-apex-desktop-fixture-'));
for(const key of ['userData','sessionData','crashDumps','logs']){
 const dir=path.join(temp,key);fs.mkdirSync(dir);app.setPath(key,dir);
}
app.enableSandbox();
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
app.commandLine.appendSwitch('disable-sync');
protocol.registerSchemesAsPrivileged([{scheme:'apex-fixture',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
const root=path.join(__dirname,'preview');
const allowed=new Map();
function index(dir){
 for(const item of fs.readdirSync(dir,{withFileTypes:true})){
  const full=path.join(dir,item.name);
  if(item.isSymbolicLink())throw Error('Symlink forbidden');
  if(item.isDirectory())index(full);
  else if(item.isFile())allowed.set('/'+path.relative(root,full).split(path.sep).join('/'),full);
 }
}
index(root);
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2'};
const csp="default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let window;
let exitCode=0;
function fail(e){console.error('FIXTURE_FAILURE',String(e));exitCode=1;app.exit(1)}
app.on('will-quit',()=>{try{fs.rmSync(temp,{recursive:true,force:true})}catch{}});
app.on('window-all-closed',()=>app.quit());
app.whenReady().then(async()=>{
 const ses=session.fromPartition('apex-preview',{cache:false});
 ses.setPermissionRequestHandler((_wc,_p,callback)=>callback(false));
 ses.setPermissionCheckHandler(()=>false);
 ses.on('will-download',event=>event.preventDefault());
 ses.webRequest.onBeforeRequest({urls:['<all_urls>']},(details,callback)=>{
  let ok=false;
  try{const u=new URL(details.url);ok=u.protocol==='apex-fixture:'&&u.hostname==='preview'&&!u.port&&!u.username&&!u.password&&allowed.has(u.pathname)&&!u.search}catch{}
  callback({cancel:!ok});
 });
 await ses.protocol.handle('apex-fixture',async request=>{
  const u=new URL(request.url);
  const f=u.hostname==='preview'&&!u.port&&!u.username&&!u.password&&!u.search&&request.method==='GET'?allowed.get(u.pathname):undefined;
  if(!f)return new Response('Denied',{status:403});
  return new Response(await fs.promises.readFile(f),{headers:{'Content-Type':mime[path.extname(f)]||'application/octet-stream','Content-Security-Policy':csp,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}});
 });
 window=new BrowserWindow({width:1360,height:880,minWidth:980,minHeight:700,title:'VYRON APEX — TEST ONLY',backgroundColor:'#101114',show:!test,webPreferences:{session:ses,sandbox:true,contextIsolation:true,nodeIntegration:false,webSecurity:true,webviewTag:false,devTools:false,spellcheck:false}});
 const wc=window.webContents;
 wc.setWindowOpenHandler(()=>({action:'deny'}));
 wc.on('will-navigate',(event,url)=>{if(url!==entry)event.preventDefault()});
 wc.on('will-frame-navigate',(event,details)=>{if(!details.isMainFrame||details.url!==entry)event.preventDefault()});
 wc.on('will-attach-webview',event=>event.preventDefault());
 wc.on('render-process-gone',(_event,details)=>fail('Renderer exited: '+details.reason));
 await window.loadURL(entry);
 if(!test)return;
 const evaluate=source=>wc.executeJavaScript(source,true);
 const until=async fn=>{for(let i=0;i<120;i++){if(await fn())return;await sleep(100)}throw Error('UI timeout')};
 await until(()=>evaluate("!!document.querySelector('[data-apex-page]')"));
 const isolated=await evaluate("typeof require==='undefined' && typeof process==='undefined' && typeof window.open==='function'");
 if(!isolated)throw Error('Node globals exposed');
 for(const route of routes){
  await evaluate('document.querySelector('+JSON.stringify('[data-apex-route="'+route+'"]')+').click()');
  await until(()=>evaluate("document.querySelector('[data-apex-page]')?.dataset.apexPage==="+JSON.stringify(route)));
  await sleep(350);
  if(!await evaluate("!document.querySelector('.uiErrorBoundary')&&(document.querySelector('[data-apex-page]')?.innerText||'').length>30"))throw Error('ROUTE_FAILED '+route);
  console.log('ROUTE_PASS',route);
 }
 console.log('DESKTOP_FIXTURE_ROUTES=21/21');
 app.quit();
}).catch(fail);
setTimeout(()=>{if(test)fail('Timeout')},100000).unref();
