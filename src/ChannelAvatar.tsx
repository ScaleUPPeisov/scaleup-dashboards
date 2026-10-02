import React,{useEffect,useRef,useState} from 'react';
import type {Channel} from './types';
import {recordYoutubeRouteEvent} from './youtubeRouteDiagnostics';

export type ChannelAvatarSize='sm'|'md'|'lg';

export function channelAvatarSource(channel:Channel){
  return String(channel.analytics?.channelThumbnail||channel.stats?.thumbnail||'').trim();
}

function cachedAvatar(key:string){
  try{return localStorage.getItem(key)||''}catch{return''}
}
function initial(name:string){
  const value=String(name||'YT').trim();
  return (value.match(/[\p{L}\p{N}]/u)?.[0]||'Y').toUpperCase();
}

export function ChannelAvatar({channel,size='md',className='',title}:{channel:Channel;size?:ChannelAvatarSize;className?:string;title?:string}){
  const key=`vyron:channel-avatar:v1:${channel.youtubeChannelId||channel.id}`;
  const primary=channelAvatarSource(channel);
  const [src,setSrc]=useState(()=>primary||cachedAvatar(key));
  const [failed,setFailed]=useState(false);
  const sourceIdentityRef=useRef(key+'\u0000'+primary);

  useEffect(()=>{
    const identity=key+'\u0000'+primary;
    if(sourceIdentityRef.current===identity)return;
    sourceIdentityRef.current=identity;
    if(!primary)return;
    if(src!==primary){recordYoutubeRouteEvent('ChannelAvatar','state-write:src-change');setSrc(primary)}
    if(failed){recordYoutubeRouteEvent('ChannelAvatar','state-write:clear-failed');setFailed(false)}
  },[key,primary]);

  if(!src||failed){
    return <span className={`channelAvatar channelAvatar-${size} channelAvatarFallback ${className}`.trim()} title={title||channel.name} aria-label={channel.name}>{initial(channel.name)}</span>
  }
  return <img
    className={`channelAvatar channelAvatar-${size} ${className}`.trim()}
    src={src}
    alt=""
    title={title||channel.name}
    loading="lazy"
    decoding="async"
    onLoad={()=>{
      try{if(localStorage.getItem(key)!==src)localStorage.setItem(key,src)}catch{}
    }}
    onError={()=>{
      const fallback=cachedAvatar(key);
      if(fallback&&fallback!==src){recordYoutubeRouteEvent('ChannelAvatar','state-write:fallback-src');setSrc(fallback);return}
      recordYoutubeRouteEvent('ChannelAvatar','state-write:failed');
      setFailed(true)
    }}
  />
}
