import type {Channel,YoutubeProfile} from './types';

export const YOUTUBE_OAUTH_STATE_CHANGED_EVENT='vyron:oauth-state-changed';

const clean=(value?:string|null)=>String(value||'').trim();

export function countConnectedYoutubeBindings(channels:readonly Channel[],profiles:readonly YoutubeProfile[]){
  const byId=new Map(profiles.map(profile=>[clean(profile.id),profile] as const).filter(([id])=>Boolean(id)));
  return channels.filter(channel=>{
    const profileId=clean(channel.youtubeProfileId),channelId=clean(channel.youtubeChannelId);
    if(!profileId||!channelId)return false;
    const profile=byId.get(profileId);
    return Boolean(profile&&clean(profile.channelId)===channelId);
  }).length;
}

export function notifyYoutubeOauthStateChanged(){
  if(typeof window!=='undefined')window.dispatchEvent(new Event(YOUTUBE_OAUTH_STATE_CHANGED_EVENT));
}
