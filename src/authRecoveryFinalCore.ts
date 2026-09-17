export type FinalAuthStatus='CONNECTED'|'RECONNECT REQUIRED'|'CONNECTING'|'VALIDATING'|'WRONG CHANNEL'|'FAILED';
export type RecoveryChannelLike={id:string;name:string;youtubeProfileId?:string;youtubeChannelId?:string};
export type RecoveryProfileLike={id:string;channelId?:string;channelTitle?:string;preferredBrowser?:string};
export type RecoveryInventoryLike={profile_uuid:string;refresh_token_account?:string;refresh_token_read?:string};
export type RecoveryTransient={status:FinalAuthStatus;detail?:string};
export type FinalRecoveryRow={profileId:string;profile?:RecoveryProfileLike;channels:RecoveryChannelLike[];expectedChannelId?:string;status:FinalAuthStatus;detail:string;stale:boolean;duplicate:boolean;conflict:boolean};

export function buildFinalRecoveryRows(channels:RecoveryChannelLike[],profiles:RecoveryProfileLike[],inventory:RecoveryInventoryLike[],transient:Record<string,RecoveryTransient>={}){
 const inv=new Map(inventory.map(x=>[x.profile_uuid,x])),byProfile=new Map<string,RecoveryChannelLike[]>();
 for(const c of channels){if(c.youtubeProfileId){const a=byProfile.get(c.youtubeProfileId)||[];a.push(c);byProfile.set(c.youtubeProfileId,a)}}
 const duplicateIds=new Set<string>();const byYoutube=new Map<string,string[]>();
 for(const p of profiles){if(!p.channelId)continue;const a=byYoutube.get(p.channelId)||[];a.push(p.id);byYoutube.set(p.channelId,a)}
 for(const ids of byYoutube.values())if(ids.length>1)ids.forEach(x=>duplicateIds.add(x));
 return profiles.map(profile=>{
  const mapped=byProfile.get(profile.id)||[],stale=mapped.length===0,duplicate=duplicateIds.has(profile.id);
  const expectedIds=new Set<string>();if(profile.channelId)expectedIds.add(profile.channelId);for(const c of mapped)if(c.youtubeChannelId)expectedIds.add(c.youtubeChannelId);
  const conflict=expectedIds.size>1,expectedChannelId=expectedIds.size===1?[...expectedIds][0]:undefined,forced=transient[profile.id];
  if(forced)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:forced.status,detail:forced.detail||forced.status,stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(stale)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'OAuth profile не привязан ни к одному текущему каналу. Данные не удалены.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(duplicate)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'Обнаружены duplicate OAuth profiles для одного YouTube channel_id. Автоматический reconnect заблокирован.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(conflict)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'Внутри одного OAuth profile обнаружены разные expected channel_id. Автоматический reconnect заблокирован.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(!expectedChannelId)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'У профиля нет ожидаемого YouTube channel_id. Сначала требуется безопасная привязка mapping.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  const key=inv.get(profile.id),present=key?.refresh_token_account==='PRESENT',read=key?.refresh_token_read||'NOT_RUN',connected=present&&(read==='PASS'||read==='NOT_RUN');
  return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:connected?'CONNECTED':'RECONNECT REQUIRED',detail:connected?(read==='PASS'?'Refresh token подтверждён explicit readback.':'Refresh token account присутствует; значение будет проверено только при реальной OAuth/YouTube операции.'):'Данные канала сохранены. Нужно снова войти в Google.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
 })
}
export function channelsWithoutProfile(channels:RecoveryChannelLike[],profiles:RecoveryProfileLike[]){const ids=new Set(profiles.map(x=>x.id));return channels.filter(c=>!c.youtubeProfileId||!ids.has(c.youtubeProfileId))}
export function reconnectQueue(rows:FinalRecoveryRow[]){return rows.filter(x=>x.status==='RECONNECT REQUIRED')}
export function nextReconnectProfileId(rows:FinalRecoveryRow[],afterProfileId?:string){const q=reconnectQueue(rows);if(!q.length)return undefined;if(!afterProfileId)return q[0].profileId;const all=rows.map(x=>x.profileId),start=all.indexOf(afterProfileId);for(let i=1;i<=all.length;i++){const id=all[(Math.max(start,0)+i)%all.length];if(q.some(x=>x.profileId===id))return id}return q[0].profileId}
export function reconnectFailure(error:unknown):{status:'WRONG CHANNEL'|'FAILED';message:string}{const raw=String(error??'');const low=raw.toLowerCase();if(low.includes('wrong_channel'))return{status:'WRONG CHANNEL',message:raw.replace(/^.*WRONG_CHANNEL:\s*/i,'')||'Авторизован другой YouTube канал.'};if(low.includes('oauth_refresh_token_required')||low.includes('google не вернул refresh token'))return{status:'FAILED',message:'Google не вернул refresh token. Повторите подключение.'};return{status:'FAILED',message:raw.replace(/^Error:\s*/i,'')||'Подключение не завершено.'}}
