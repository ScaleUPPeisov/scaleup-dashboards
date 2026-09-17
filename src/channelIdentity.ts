import type {Channel} from './types';

export function normalizeChannelName(value?:string){
 return String(value||'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase()
}

export function isFutureChannel(channel:Pick<Channel,'youtubeProfileId'|'youtubeChannelId'>){
 return !channel.youtubeProfileId&&!channel.youtubeChannelId
}

export function findFutureChannelMatch(channels:Channel[],youtubeTitle?:string){
 const key=normalizeChannelName(youtubeTitle);if(!key)return undefined;
 const matches=channels.filter(c=>isFutureChannel(c)&&normalizeChannelName(c.name)===key);
 return matches.length===1?matches[0]:undefined
}

export function hasChannelNameConflict(channels:Channel[],name:string,exceptId?:string){
 const key=normalizeChannelName(name);return Boolean(key)&&channels.some(c=>c.id!==exceptId&&normalizeChannelName(c.name)===key)
}
