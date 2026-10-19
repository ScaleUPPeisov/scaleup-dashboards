import type {UploadHistoryRecord} from './types';

export type CleanupExecutionStatus='MOVED'|'MISSING'|'SOURCE_CHANGED'|'BLOCKED'|'TRASH_FAILED';
export type CleanupExecutionRow={record:UploadHistoryRecord;status:CleanupExecutionStatus;error?:string};
export type CleanupExecutionResult={rows:CleanupExecutionRow[];moved:number;failed:number};
export type CleanupExecutorDeps={
 localStatus:(path:string)=>Promise<{exists:boolean;isFile:boolean;size?:number|null}>;
 fingerprint:(path:string)=>Promise<{fingerprint:string;size:number}>;
 trash:(path:string,allowedRoots:string[])=>Promise<{trashed:boolean;missing:boolean}>;
 allowedRoots:(record:UploadHistoryRecord)=>string[];
};

export async function executeGlobalCleanup(records:UploadHistoryRecord[],deps:CleanupExecutorDeps):Promise<CleanupExecutionResult>{
 const rows:CleanupExecutionRow[]=[];
 for(const record of records){
  try{
   const status=await deps.localStatus(record.localFilePath);
   if(!status.exists){rows.push({record,status:'MISSING'});continue}
   if(!status.isFile){rows.push({record,status:'BLOCKED',error:'LOCAL_SOURCE_NOT_FILE'});continue}
   if(Number(status.size)!==Number(record.fileSize)){rows.push({record,status:'SOURCE_CHANGED',error:'LOCAL_SIZE_CHANGED'});continue}
   const fp=await deps.fingerprint(record.localFilePath);
   if(fp.size!==record.fileSize||fp.fingerprint.trim().toLowerCase()!==record.sha256.trim().toLowerCase()){
    rows.push({record,status:'SOURCE_CHANGED',error:'LOCAL_FINGERPRINT_CHANGED'});continue
   }
   const roots=deps.allowedRoots(record).filter(Boolean);
   if(!roots.length){rows.push({record,status:'BLOCKED',error:'NO_ALLOWED_RENDER_ROOT'});continue}
   const trash=await deps.trash(record.localFilePath,roots);
   if(trash.trashed)rows.push({record,status:'MOVED'});
   else if(trash.missing)rows.push({record,status:'MISSING'});
   else rows.push({record,status:'TRASH_FAILED',error:'TRASH_NOT_CONFIRMED'});
  }catch(error){rows.push({record,status:'TRASH_FAILED',error:String(error)})}
 }
 const moved=rows.filter(row=>row.status==='MOVED').length;
 return{rows,moved,failed:rows.length-moved};
}
