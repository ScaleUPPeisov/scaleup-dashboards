import type {Channel,VideoJob,YoutubeProfile} from './types';

export function createApexFixture(now=Date.now()){
 const channels:Channel[]=Array.from({length:33},(_,i)=>{
  const n=String(i+1).padStart(2,'0'),id='apex-demo-'+n;
  return {id,name:['Северное сияние','Ночной город','Музыка для работы'][i]||'Тестовый канал '+n,slug:id,enabled:true,cadenceDays:3,targetBufferDays:60,publishHour:4,publishMinute:0,language:'RU',genre:'Music',country:'Россия',minTracks:10,targetDurationMin:120,
   youtubeProfileId:'demo-profile-'+n,youtubeChannelId:'UC'+String(i+1).padStart(22,'0'),renderFolderPath:'/APEX_FIXTURE_ONLY/render/'+n,projectsFolderPath:'/APEX_FIXTURE_ONLY/projects/'+n,
   seo:{titlePatterns:[],descriptionTemplate:'Тестовое описание',tags:['demo'],banned:[]}};
 });
 const profiles:YoutubeProfile[]=channels.map(c=>({id:c.youtubeProfileId!,channelId:c.youtubeChannelId,channelTitle:c.name,credentialStatus:'READY'}));
 const jobs:VideoJob[]=channels.flatMap((c,i)=>Array.from({length:12},(_,j)=>{
  const id=c.id+'-job-'+j,folder='/APEX_FIXTURE_ONLY/projects/'+id;
  return {id,channelId:c.id,number:j+1,folder,finalPath:'/APEX_FIXTURE_ONLY/render/'+id+'.mp4',status:'READY_UPLOAD',createdAt:new Date(now-86400000).toISOString(),publishAt:new Date(now+(j+1)*3*86400000+i*60000).toISOString(),tracksCount:10,minTracks:10,title:'Демонстрационное видео '+(j+1),description:'Только синтетические данные',tags:['demo','music']};
 }));
 return {channels,profiles,jobs};
}

// Every command is denied by default, including save, upload, OAuth, opener,
// file selection, external process, cleanup, updater and network operations.
// Do not add permissive catch-all responses or fake mutation success.
export function fixtureIpc(command:string,fixture:ReturnType<typeof createApexFixture>):unknown{
 switch(command){
  case 'youtube_oauth_profiles':return structuredClone(fixture.profiles);
  case 'youtube_oauth_credential_states':return {credentialSchemaVersion:2,profiles:[],secretValuesIncluded:false,youtubeApiRequests:0,keychainSecretReads:0};
  case 'youtube_google_config_status':return {configured:false,oauthReady:false,hasSecret:false,hasApiKey:false,secretValuesIncluded:false};
  case 'youtube_upload_sessions':return [];
  case 'plugin:app|version':return '7.0.0-fixture';
  case 'plugin:app|name':return 'VYRON APEX fixture';
  default:throw new Error('APEX_FIXTURE_BLOCKED: '+command);
 }
}
