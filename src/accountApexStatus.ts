/** Preserve the distinction between a saved profile and verified access. */
export function accountAccessLabel(verified:boolean,globalRepair:boolean,state:string):string{
 if(verified)return 'подтверждён';
 if(globalRepair)return 'требует восстановления';
 if(state==='KEYCHAIN_BLOCKED')return 'Keychain заблокирован';
 if(state==='RECONNECT_REQUIRED'||state==='MISSING')return 'нужен повторный вход';
 if(state==='WRONG_CHANNEL')return 'канал не совпадает';
 return 'не проверен';
}
