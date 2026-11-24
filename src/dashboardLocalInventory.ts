import type {Channel} from './types';
import type {ChannelInventorySnapshot} from './renderInventoryRuntime';

export type DashboardLocalInventory={
  ready:number|null;
  runwayDays:number|null;
  state:'current'|'stale'|'unknown';
  lastConfirmedAt?:string;
};

/** A zero is meaningful only after a successful local folder scan. */
export function dashboardLocalInventory(snapshot?:ChannelInventorySnapshot):DashboardLocalInventory{
  const current=Boolean(snapshot&&snapshot.folderState==='ONLINE'&&!snapshot.stale);
  const previouslyConfirmed=Boolean(snapshot?.lastConfirmedAt);
  if(!snapshot||(!current&&!previouslyConfirmed))return{ready:null,runwayDays:null,state:'unknown'};
  const ready=Number.isFinite(snapshot.readyVideos)?snapshot.readyVideos:null;
  const runwayDays=Number.isFinite(snapshot.runwayDays)?snapshot.runwayDays:null;
  return{ready,runwayDays,state:current?'current':'stale',lastConfirmedAt:snapshot.lastConfirmedAt};
}

/** Sum only confirmed snapshots; the status records missing and stale channels. */
export function dashboardLocalInventoryTotal(channels:Channel[],snapshots:Record<string,ChannelInventorySnapshot>){
  const enabled=channels.filter(channel=>channel.enabled!==false);
  let ready=0,known=0,stale=0;
  for(const channel of enabled){
    const item=dashboardLocalInventory(snapshots[channel.id]);
    if(item.ready===null)continue;
    ready+=item.ready;known++;
    if(item.state==='stale')stale++;
  }
  const missing=enabled.length-known;
  return{ready:known||!enabled.length?ready:null,known,missing,stale,total:enabled.length};
}
