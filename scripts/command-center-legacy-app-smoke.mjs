import {chromium} from 'playwright';

const channels=Array.from({length:31},(_,i)=>({
  id:`channel-${i+1}`,
  name:`Channel ${String(i+1).padStart(2,'0')}`,
  slug:`channel-${i+1}`,
  cadenceDays:4,targetBufferDays:60,publishHour:18,publishMinute:0,
  language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,
  youtubeProfileId:`profile-${i+1}`,youtubeChannelId:`youtube-${i+1}`,
  seo:{titlePatterns:['{topic}'],descriptionTemplate:'{title}',tags:['music'],banned:[]}
}));

const state={
  version:8,
  channels,
  jobs:[],competitors:[],logs:[],uploadHistory:[],fingerprintCache:{},projectLifecycle:{},
  settings:{
    workspace:'/tmp/vyron-rc-smoke',endlumePath:'',youtubeApiKey:'',autoCheckUpdates:false,reduceMotion:false,fpsMonitor:false,
    autopilotMode:'off',autopilotEnabled:false,autoCreatePlan:true,autoAssignMusic:true,autoAssignImages:true,autoGenerateMetadata:false,
    autoQueueRender:true,autoOpenEndlume:false,autoUploadYoutube:false,autopilotIntervalSec:30,tracksPerVideo:10,
    openaiApiKey:'',openaiModel:'',youtubeOAuthClientId:'',youtubeCategoryId:'10',youtubeIntelligenceAutoRefresh:false,youtubeIntelligenceRefreshMin:30,youtubePublishSafeMode:true,youtubeUploadConcurrency:2,
    competitorRpmLow:1.2,competitorRpmHigh:4,competitorPoolSize:30,publishedVideoCleanupPolicy:'ask',completedProjectCleanupPolicy:'ask',
    endlumeTargetDurationMin:120,endlumeTargetRenderSec:35,endlumeTargetFileMinMb:700,endlumeTargetFileMaxMb:1000,endlumePreserveImageQuality:true,endlumeProjectNaming:'VIDEO_{number}'
  }
};

const legacyVariants=[
  {version:1},
  {version:1,videos:null,baseline:null,lastUndo:null},
  {version:1,videos:{bad:true},baseline:'legacy',lastUndo:{}},
  {version:1,videos:'legacy',baseline:[],lastUndo:'legacy'},
  {version:1,videos:[null],baseline:{broken:null},lastUndo:[null]},
  {version:1,videos:[{id:'legacy-partial'}],baseline:{'legacy-base':{id:'legacy-base'}},lastUndo:[{id:'undo-partial'}]},
  {version:1,videos:[null,3,'legacy',{}, {id:'scheduled-ok',privacyStatus:'private',publishAt:'2030-01-01T10:00:00Z'}],baseline:{'legacy-bad':null,'legacy-ok':{id:'legacy-ok',privacyStatus:'private',publishAt:'2030-01-01T10:00:00Z'}},lastUndo:[null,'bad']}
];

const browser=await chromium.launch({headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000}});
const pageErrors=[];
page.on('pageerror',error=>pageErrors.push(String(error?.stack||error)));

await page.addInitScript(({state,channels,legacyVariants})=>{
  channels.forEach((channel,i)=>localStorage.setItem(`vyron:existing-cache:v1:${channel.id}`,JSON.stringify(legacyVariants[i%legacyVariants.length])));
  localStorage.setItem('vyron:channel-runway:v1',JSON.stringify({
    version:1,
    channels:Object.fromEntries(channels.map((channel,i)=>[channel.id,{channelId:channel.id,channelName:i%2?undefined:null,scheduledVideoCount:i%3?0:undefined,lastLocalCalculation:i%4?'2026-09-01T00:00:00.000Z':undefined,status:i%5?'no-data':undefined,priority:'unknown'}]))
  }));
  localStorage.setItem('vyron:production-manager:v2',JSON.stringify({
    version:2,selectedChannelId:42,tab:'legacy-tab',selectedJobIds:'legacy',productionRoot:{bad:true},
    byChannel:{'channel-1':{projectCount:'legacy',tracksPerProject:null,mode:'legacy',allowImageReuse:'yes',selectedProjectIds:'legacy',productionRoot:55},'channel-2':null}
  }));

  let callbackId=1;
  window.__TAURI_INTERNALS__={
    transformCallback(fn){const id=callbackId++;window[`_${id}`]=fn;return id},
    async invoke(command){
      if(command==='load_state')return state;
      if(command==='save_state')return{ok:true};
      if(command==='license_status')return{valid:true,type:'owner-lifetime'};
      if(command==='default_workspace')return'/tmp/vyron-rc-smoke';
      if(command==='youtube_active_uploads'||command==='youtube_upload_sessions'||command==='youtube_oauth_profiles')return[];
      if(command==='youtube_google_config_status')return{configured:false,hasSecret:false,hasApiKey:false};
      if(command==='list_production_batches')return[];
      if(command==='production_channel_state')return{settings:{},importSession:{schemaVersion:1,sessionId:'',channelId:'',channelName:'',active:false,startedAt:'',downloadsPath:'',importPath:'',collected:[]},music:null,batches:[]};
      if(command==='production_import_status')return{schemaVersion:1,sessionId:'',channelId:'',channelName:'',active:false,startedAt:'',downloadsPath:'',importPath:'',collected:[]};
      if(command==='find_production_recovery')return[];
      if(command==='plugin:app|version'||command.includes('app|version'))return'2.1.9-rc.1';
      if(command.includes('plugin:event|listen'))return callbackId++;
      if(command.includes('plugin:event|unlisten'))return null;
      if(command.includes('plugin:updater|check'))return null;
      if(command.includes('plugin:notification'))return false;
      return null;
    },
    metadata:{currentWindow:{label:'main'},currentWebview:{label:'main',windowLabel:'main'}}
  };
  window.confirm=()=>false;
},{state,channels,legacyVariants});

await page.goto('http://127.0.0.1:1421',{waitUntil:'networkidle'});
await page.locator('.appShell').waitFor();
const sidebar=page.locator('aside.sidebar');
const main=page.locator('main.main');

async function assertVisibleCommandCenter(label){
  await main.getByText('КОМАНДНЫЙ ЦЕНТР',{exact:true}).waitFor({timeout:5000});
  const text=(await main.locator('.pageWrap').innerText()).trim();
  if(!text)throw new Error(`EMPTY_COMMAND_CENTER:${label}`);
  if(await main.locator('[data-testid="vyron-error-boundary"]').count())throw new Error(`ERROR_BOUNDARY_TRIGGERED:${label}`);
  const rows=await main.locator('.commandChannelRow').count();
  if(rows!==31)throw new Error(`CHANNEL_COUNT:${rows}:${label}`);
}

async function openCommandCenter(label){
  await main.getByRole('button',{name:'Командный центр',exact:true}).click();
  await assertVisibleCommandCenter(label);
}

await openCommandCenter('initial');
for(let i=0;i<10;i++){
  await sidebar.getByRole('button',{name:'Главная',exact:true}).click();
  await main.locator('[data-testid="dashboard-kpis"]').waitFor();
  await openCommandCenter(`reopen-${i+1}`);
}

await sidebar.getByRole('button',{name:'Каналы',exact:true}).click();
await page.waitForTimeout(100);
if(!(await main.locator('.pageWrap').innerText()).trim())throw new Error('EMPTY_CHANNELS_ROUTE');
await sidebar.getByRole('button',{name:'Главная',exact:true}).click();
await main.locator('[data-testid="dashboard-kpis"]').waitFor();
await openCommandCenter('after-channels');

await sidebar.getByRole('button',{name:'Производство',exact:true}).click();
await page.waitForTimeout(150);
if(!(await main.locator('.pageWrap').innerText()).trim())throw new Error('EMPTY_PRODUCTION_ROUTE');
await sidebar.getByRole('button',{name:'Главная',exact:true}).click();
await main.locator('[data-testid="dashboard-kpis"]').waitFor();
await openCommandCenter('after-production');

if(pageErrors.length)throw new Error(`UNCAUGHT_RENDERER:${pageErrors.join(' | ')}`);
console.log('COMMAND_CENTER_RENDER=PASS');
console.log('NO_UNCAUGHT_EXCEPTION=PASS');
console.log('ALL_31_CHANNELS_SAFE=PASS');
console.log('COMMAND_CENTER_REOPEN=PASS');
console.log('COMMAND_CENTER_NAVIGATION=PASS');
console.log('REAL_APP_ROUTE=PASS');
await browser.close();
