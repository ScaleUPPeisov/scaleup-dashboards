import type {VideoJob} from './types';
import type {RenderScanRow} from './renderScanClassifier';
import {normalizeRenderPath,renderPathInsideRoot} from './renderScanClassifier';

export type PublisherInventoryPatch={id:string;patch:Partial<VideoJob>};
export type PublisherInventoryReconciliation={
  normalizePatches:PublisherInventoryPatch[];
  createRows:RenderScanRow[];
  readyPhysicalPaths:Set<string>;
  unresolved:RenderScanRow[];
  restoredJobIds:string[];
};

/**
 * Canonical bridge between a fresh physical inventory snapshot and Publisher jobs.
 * Input rows MUST already be filtered through renderInventoryRuntime.readyRows().
 * No filesystem or YouTube API work happens here.
 */
export function reconcilePublisherInventory({
  channelId,
  exactRoot,
  ready,
  jobs,
}:{
  channelId:string;
  exactRoot:string;
  ready:RenderScanRow[];
  jobs:VideoJob[];
}):PublisherInventoryReconciliation{
  const byId=new Map(jobs.map(j=>[j.id,j]));
  const normalizePatches:PublisherInventoryPatch[]=[];
  const createRows:RenderScanRow[]=[];
  const readyPhysicalPaths=new Set<string>();
  const unresolved:RenderScanRow[]=[];
  const restoredJobIds:string[]=[];

  for(const row of ready){
    const path=normalizeRenderPath(row.file.path);
    if(!path||!renderPathInsideRoot(path,exactRoot)){unresolved.push(row);continue}
    readyPhysicalPaths.add(path);

    if(row.classification==='NEW_CANDIDATE'||row.classification==='NEW_GENERATION'){
      const fp=String(row.currentFingerprint||row.file.fingerprint||'').trim().toLowerCase();
      const size=Number(row.currentFileSize??row.file.size);
      const matched=row.matchedJobId?byId.get(row.matchedJobId):undefined;
      const matchedFp=String(matched?.currentSourceFingerprint||'').trim().toLowerCase();
      const reusableMatched=Boolean(
        matched
        &&matched.channelId===channelId
        &&!matched.youtubeVideoId
        &&!matched.uploadedAt
        &&matched.storageLifecycle!=='UPLOADED'
        &&matched.storageLifecycle!=='TRASHED'
        &&matched.storageLifecycle!=='TRASHED_BY_VYRON'
        &&normalizeRenderPath(matched.finalPath||'')===path
        &&(!matchedFp||(matchedFp===fp&&Number(matched.currentSourceFileSize)===size))
      );
      const existingSameGeneration=reusableMatched?matched:jobs.find(job=>
        job.channelId===channelId
        &&!job.youtubeVideoId
        &&!job.uploadedAt
        &&job.storageLifecycle!=='UPLOADED'
        &&job.storageLifecycle!=='TRASHED'
        &&job.storageLifecycle!=='TRASHED_BY_VYRON'
        &&normalizeRenderPath(job.finalPath||'')===path
        &&Boolean(fp)
        &&String(job.currentSourceFingerprint||'').trim().toLowerCase()===fp
        &&Number(job.currentSourceFileSize)===size
      );
      if(existingSameGeneration){
        normalizePatches.push({
          id:existingSameGeneration.id,
          patch:{
            sourceOrigin:'render-scan',
            finalPath:row.file.path,
            currentSourceFingerprint:fp||existingSameGeneration.currentSourceFingerprint,
            currentSourceFileSize:size,
            currentSourceModifiedAt:row.file.modifiedAt||existingSameGeneration.currentSourceModifiedAt,
            sourceGenerationKey:fp?`${channelId}:${fp}:${size}`:existingSameGeneration.sourceGenerationKey,
            status:'READY_UPLOAD',
            storageLifecycle:'NEW',
            removedFromPublishList:false,
            scanRecoveryState:undefined,
            error:undefined,
          }
        });
        if(existingSameGeneration.status==='ERROR'||existingSameGeneration.storageLifecycle==='FAILED'||Boolean(existingSameGeneration.error))restoredJobIds.push(existingSameGeneration.id);
      }else createRows.push(row);
      continue
    }

    if(row.classification!=='KNOWN_EXACT'||!row.matchedJobId){
      unresolved.push(row);
      continue
    }

    const job=byId.get(row.matchedJobId);
    if(!job||job.channelId!==channelId){
      unresolved.push(row);
      continue
    }

    // readyRows() already excludes confirmed historical/uploading/failed generations.
    // KNOWN_EXACT also means classifier found no trusted same-channel successful
    // SHA+size upload proof for the current bytes. Normalize legacy registration only.
    normalizePatches.push({
      id:job.id,
      patch:{
        sourceOrigin:'render-scan',
        finalPath:row.file.path,
        currentSourceFingerprint:row.currentFingerprint||row.file.fingerprint||job.currentSourceFingerprint,
        currentSourceFileSize:row.currentFileSize??row.file.size,
        currentSourceModifiedAt:row.file.modifiedAt||job.currentSourceModifiedAt,
        sourceGenerationKey:(row.currentFingerprint||row.file.fingerprint)?`${channelId}:${row.currentFingerprint||row.file.fingerprint}:${row.currentFileSize??row.file.size}`:job.sourceGenerationKey,
        status:'READY_UPLOAD',
        storageLifecycle:'NEW',
        removedFromPublishList:false,
        scanRecoveryState:undefined,
        error:undefined,
      }
    });
    if(job.status==='ERROR'||job.storageLifecycle==='FAILED'||Boolean(job.error))restoredJobIds.push(job.id);
  }

  return{normalizePatches,createRows,readyPhysicalPaths,unresolved,restoredJobIds}
}

export function publisherReadyPathSet(ready:RenderScanRow[],exactRoot:string){
  const out=new Set<string>();
  for(const row of ready){
    const path=normalizeRenderPath(row.file.path);
    if(path&&renderPathInsideRoot(path,exactRoot))out.add(path);
  }
  return out
}


export function publisherInventoryJobs({
  jobs,
  channelId,
  readyPhysicalPaths,
  recoveryJobIds=new Set<string>(),
}:{
  jobs:VideoJob[];
  channelId:string;
  readyPhysicalPaths:ReadonlySet<string>;
  recoveryJobIds?:ReadonlySet<string>;
}){
  const supersededJobIds=new Set(
    jobs.filter(j=>j.channelId===channelId&&j.sourcePreviousJobId).map(j=>j.sourcePreviousJobId!)
  );
  return jobs.filter(j=>
    j.channelId===channelId
    &&Boolean(j.finalPath)
    &&readyPhysicalPaths.has(normalizeRenderPath(j.finalPath||''))
    &&!j.removedFromPublishList
    &&!recoveryJobIds.has(j.id)
    &&!supersededJobIds.has(j.id)
    &&!j.youtubeVideoId
    &&!j.uploadedAt
    &&j.storageLifecycle!=='UPLOADED'
    &&j.status!=='SCHEDULED'
    &&['READY_UPLOAD','UPLOADING','ERROR'].includes(j.status)
  ).sort((a,b)=>a.number-b.number)
}


export function publisherCurrentPhysicalSize(job:VideoJob,files:ReadonlyArray<{path:string;size:number}>){
  const path=normalizeRenderPath(job.finalPath||'');
  if(path){
    const scanned=files.find(file=>normalizeRenderPath(file.path)===path);
    const scanSize=Number(scanned?.size);
    if(Number.isFinite(scanSize)&&scanSize>0)return scanSize
  }
  const stored=Number(job.currentSourceFileSize);
  return Number.isFinite(stored)&&stored>0?stored:undefined
}
