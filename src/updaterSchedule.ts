export const UPDATER_AUTO_INTERVAL_MS=15*60*1000;
export const UPDATER_FOREGROUND_MIN_AGE_MS=5*60*1000;
export const UPDATER_MAX_BACKOFF_MS=60*60*1000;

export function updaterBackoffMs(consecutiveFailures:number){
  if(consecutiveFailures<=1)return UPDATER_AUTO_INTERVAL_MS;
  if(consecutiveFailures===2)return 30*60*1000;
  return UPDATER_MAX_BACKOFF_MS;
}

export function shouldRunUpdaterAgeCheck(lastCheckAttemptAt:number|undefined,now=Date.now()){
  return lastCheckAttemptAt==null||now-lastCheckAttemptAt>=UPDATER_FOREGROUND_MIN_AGE_MS;
}

export function updaterNextAutomaticCheckAt(lastCheckCompletedAt:number|undefined,consecutiveFailures:number,now=Date.now()){
  const base=lastCheckCompletedAt??now;
  return base+updaterBackoffMs(consecutiveFailures);
}
