/** A corrupt localStorage snapshot is not the same as an empty queue. */
export function selectDurableQueueSnapshot(staging:string|null,primary:string|null):unknown{
  let found=false;
  for(const raw of [staging,primary]){
    if(raw===null)continue;
    found=true;
    try{
      const parsed:unknown=JSON.parse(raw);
      if(parsed&&typeof parsed==='object'){
        const value=parsed as {version?:unknown;entries?:unknown};
        if(value.version===1&&Array.isArray(value.entries))return parsed;
      }
    }catch{/* fall back to the last complete JSON generation */}
  }
  return found?{version:1,entries:[],recoveryIntegrityError:'CORRUPT_PERSISTED_QUEUE'}:undefined;
}
