export type FinalAuthStatus='CONNECTED'|'KEYCHAIN BLOCKED'|'CANONICAL_PRESENT_UNVERIFIED'|'NOT CHECKED'|'CLIENT SECRET REQUIRED'|'RECONNECT REQUIRED'|'MISSING'|'CONNECTING'|'VALIDATING'|'WRONG CHANNEL'|'FAILED';
export type RecoveryChannelLike={id:string;name:string;youtubeProfileId?:string;youtubeChannelId?:string};
export type RecoveryProfileLike={id:string;channelId?:string;channelTitle?:string;preferredBrowser?:string};
export type RecoveryCredentialStateLike={profileUuid:string;expectedChannelId?:string|null;canonicalRefreshPresent?:boolean;legacyRefreshPresent?:boolean;migrationState?:string;credentialState:'READY'|'CONNECTED'|'RECOVERABLE_KEYCHAIN_BLOCKED'|'KEYCHAIN_BLOCKED'|'CANONICAL_PRESENT_UNVERIFIED'|'NOT_CHECKED'|'RECONNECT_REQUIRED'|'MISSING'|'WRONG_CHANNEL'|'FAILED';credentialSchemaVersion?:number;lastValidatedAt?:string|null;lastValidationResult?:string;clientSecretState?:'PROFILE_CANONICAL'|'GLOBAL_EXACT_MATCH'|'GLOBAL_CURRENT_READY'|'CANONICAL_PRESENT_UNVERIFIED'|'KEYCHAIN_BLOCKED'|'CLIENT_SECRET_REIMPORT_REQUIRED'|'MISSING';clientSecretPresent?:boolean;clientSecretOperational?:boolean};
export type RecoveryTransient={status:FinalAuthStatus;detail?:string};
export type FinalRecoveryRow={profileId:string;profile?:RecoveryProfileLike;channels:RecoveryChannelLike[];expectedChannelId?:string;status:FinalAuthStatus;detail:string;stale:boolean;duplicate:boolean;conflict:boolean};

export function buildFinalRecoveryRows(channels:RecoveryChannelLike[],profiles:RecoveryProfileLike[],credentialStates:RecoveryCredentialStateLike[],transient:Record<string,RecoveryTransient>={}){
 const resolved=new Map(credentialStates.map(x=>[x.profileUuid,x])),byProfile=new Map<string,RecoveryChannelLike[]>();
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
  const state=resolved.get(profile.id);
  if(!state)return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'MISSING',detail:'Credential state отсутствует. Требуется переподключение Google без изменения Profile UUID.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(state.clientSecretState==='KEYCHAIN_BLOCKED')return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'KEYCHAIN BLOCKED',detail:'Client Secret сохранён, но macOS Keychain временно блокирует доступ. Каналы и профили сохранены; сначала попробуйте безопасную проверку.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(state.clientSecretState==='CLIENT_SECRET_REIMPORT_REQUIRED')return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'CLIENT SECRET REQUIRED',detail:'Нужно один раз восстановить GLOBAL OAuth Client через credentials.json. Каналы, Profile UUID и привязки останутся на месте.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(state.clientSecretState==='MISSING')return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'CLIENT SECRET REQUIRED',detail:'GLOBAL OAuth Client настроен не полностью. Импортируйте один credentials.json для всего VYRON; после этого VYRON сначала попробует сохранённые refresh tokens.',stale,duplicate,conflict} satisfies FinalRecoveryRow;
  if(state.credentialState==='READY'||state.credentialState==='CONNECTED'){
   const suffix=state.lastValidatedAt?` Последняя проверка: ${state.lastValidatedAt}.`:'';
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'CONNECTED',detail:`Сохранённый доступ работает. Повторный вход не нужен.${suffix}`,stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='RECOVERABLE_KEYCHAIN_BLOCKED'){
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'KEYCHAIN BLOCKED',detail:'Сохранённый token существует и metadata видна, но macOS запретил secret-read. Это восстановимый Keychain incident: сначала используйте «Восстановить сохранённые подключения». Google login не требуется автоматически.',stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='KEYCHAIN_BLOCKED'){
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'KEYCHAIN BLOCKED',detail:'Сохранённый token существует, но macOS Keychain сейчас блокирует чтение. Канал остаётся на месте; сначала используйте явное восстановление Keychain.',stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='NOT_CHECKED'){
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'NOT CHECKED',detail:'Сохранённые данные канала на месте. Доступ ещё не проверялся в текущем процессе; повторный вход пока не требуется.',stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='CANONICAL_PRESENT_UNVERIFIED'){
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'CANONICAL_PRESENT_UNVERIFIED',detail:'Сохранённый OAuth token найден. VYRON может восстановить доступ через token refresh без открытия браузера.',stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='RECONNECT_REQUIRED'){
   const detail=state.clientSecretState==='GLOBAL_CURRENT_READY'
    ?'Сохранённый refresh token отсутствует или был отозван. Повторный вход нужен только этому каналу; Profile UUID и Channel ID сохранятся. Выберите браузер только для этого канала.'
    :'Для этого канала нужен явный повторный вход. Остальные каналы не затрагиваются.';
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'RECONNECT REQUIRED',detail,stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='WRONG_CHANNEL'){
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'WRONG CHANNEL',detail:'Последняя OAuth validation вернула другой YouTube channel_id.',stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  if(state.credentialState==='FAILED'){
   return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'FAILED',detail:'Credential validation завершилась ошибкой. Данные профиля сохранены.',stale,duplicate,conflict} satisfies FinalRecoveryRow
  }
  return{profileId:profile.id,profile,channels:mapped,expectedChannelId,status:'MISSING',detail:'Сохранённый refresh token отсутствует. Повторный вход нужен только этому каналу.',stale,duplicate,conflict} satisfies FinalRecoveryRow
 })
}
export function channelsWithoutProfile(channels:RecoveryChannelLike[],profiles:RecoveryProfileLike[]){const ids=new Set(profiles.map(x=>x.id));return channels.filter(c=>!c.youtubeProfileId||!ids.has(c.youtubeProfileId))}
export function reconnectQueue(rows:FinalRecoveryRow[]){return rows.filter(x=>x.status==='RECONNECT REQUIRED'||x.status==='MISSING')}
export function nextReconnectProfileId(rows:FinalRecoveryRow[],afterProfileId?:string){const q=reconnectQueue(rows);if(!q.length)return undefined;if(!afterProfileId)return q[0].profileId;const all=rows.map(x=>x.profileId),start=all.indexOf(afterProfileId);for(let i=1;i<=all.length;i++){const id=all[(Math.max(start,0)+i)%all.length];if(q.some(x=>x.profileId===id))return id}return q[0].profileId}
export function reconnectFailure(error:unknown):{status:'CLIENT SECRET REQUIRED'|'WRONG CHANNEL'|'FAILED';message:string}{const raw=String(error??'');const low=raw.toLowerCase();if(low.includes('oauth_client_setup_required')||low.includes('oauth_client_secret_required')||low.includes('oauth_client_secret_reimport_required')||low.includes('client_secret is missing'))return{status:'CLIENT SECRET REQUIRED',message:'GLOBAL OAuth Client VYRON не настроен полностью. Импортируйте credentials.json один раз для всего приложения; отдельно для каждого канала он не нужен.'};if(low.includes('wrong_channel'))return{status:'WRONG CHANNEL',message:raw.replace(/^.*WRONG_CHANNEL:\s*/i,'')||'Авторизован другой YouTube канал.'};if(low.includes('oauth_refresh_token_required')||low.includes('google не вернул refresh token'))return{status:'FAILED',message:'Google не вернул refresh token. Повторите подключение.'};return{status:'FAILED',message:raw.replace(/^Error:\s*/i,'')||'Подключение не завершено.'}}
