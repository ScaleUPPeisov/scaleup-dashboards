import type {Channel,YoutubeProfile} from './types';

export type RpmCoverageState='VALID'|'NO_DATA'|'NO_ANALYTICS_ACCESS'|'NOT_CONNECTED';
export type RpmCoverageRow={channelId:string;channelName:string;state:RpmCoverageState;views?:number;updatedAt?:string};
export type RpmCoverage={rows:RpmCoverageRow[];valid:RpmCoverageRow[];totalViews:number;validChannels:number;zeroViewChannels:number;noData:number;noAnalyticsAccess:number;notConnected:number;updatedAt?:string};

const numeric=(value:unknown):value is number=>typeof value==='number'&&Number.isFinite(value);

export function buildRpmCoverage(channels:Channel[],profiles:YoutubeProfile[]):RpmCoverage{
 const byProfileId=new Map(profiles.map(profile=>[profile.id,profile] as const));
 const rows:RpmCoverageRow[]=channels.map(channel=>{
  const analytics=channel.analytics;
  if(analytics&&!analytics.allTime&&analytics.periodDays===28&&numeric(analytics.views)){
   return{channelId:channel.id,channelName:channel.name,state:'VALID' as const,views:analytics.views,updatedAt:analytics.updatedAt};
  }
  const profile=channel.youtubeProfileId?byProfileId.get(channel.youtubeProfileId):undefined;
  const exactConnected=Boolean(channel.youtubeProfileId&&channel.youtubeChannelId&&profile?.channelId===channel.youtubeChannelId);
  if(!exactConnected)return{channelId:channel.id,channelName:channel.name,state:'NOT_CONNECTED' as const};
  if(profile?.analyticsAuthorized===false)return{channelId:channel.id,channelName:channel.name,state:'NO_ANALYTICS_ACCESS' as const};
  return{channelId:channel.id,channelName:channel.name,state:'NO_DATA' as const};
 });
 const valid=rows.filter((row):row is RpmCoverageRow&{state:'VALID';views:number}=>row.state==='VALID'&&numeric(row.views));
 const validDates=valid.map(row=>row.updatedAt).filter((value):value is string=>Boolean(value)&&Number.isFinite(Date.parse(value!))).sort();
 return{
  rows,
  valid,
  totalViews:valid.reduce((sum,row)=>sum+row.views,0),
  validChannels:valid.length,
  zeroViewChannels:valid.filter(row=>row.views===0).length,
  noData:rows.filter(row=>row.state==='NO_DATA').length,
  noAnalyticsAccess:rows.filter(row=>row.state==='NO_ANALYTICS_ACCESS').length,
  notConnected:rows.filter(row=>row.state==='NOT_CONNECTED').length,
  updatedAt:validDates.at(-1)
 };
}

export function estimateRevenueFromRpm(totalViews:number,rpm:number){
 if(!Number.isFinite(totalViews)||totalViews<0||!Number.isFinite(rpm)||rpm<0)return undefined;
 return totalViews/1000*rpm;
}
