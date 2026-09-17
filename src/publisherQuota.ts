export function publisherVideoCapacity(videoUploadAvailable:number|null|undefined,safeRemaining?:number|null,selectedCount=Number.POSITIVE_INFINITY){
 const quota=videoUploadAvailable==null?Number.POSITIVE_INFINITY:Math.max(0,Math.floor(videoUploadAvailable||0));
 const safe=safeRemaining==null?Number.POSITIVE_INFINITY:Math.max(0,Math.floor(safeRemaining));
 const selected=Number.isFinite(selectedCount)?Math.max(0,Math.floor(selectedCount)):Number.POSITIVE_INFINITY;
 return{byQuota:videoUploadAvailable==null?null:quota,safeRemaining:safeRemaining==null?null:safe,selectedCount:Number.isFinite(selected)?selected:null,canUploadToday:Math.min(quota,safe,selected)}
}
export function quotaDelta(planned:number,actual:number){return{planned,actual,difference:actual-planned}}
