import type {VideoJob} from './types';
import type {RenderScanRow} from './renderScanClassifier';
import {normalizeRenderPath,renderPathInsideRoot} from './renderScanClassifier';

export type PublisherInventoryPatch={id:string;patch:Partial<VideoJob>};
export type PublisherInventoryReconciliation={
  normalizePatches:PublisherInventoryPatch[];
  createRows:RenderScanRow[];
  readyPhysicalPaths:Set<string>;
  unresolved:RenderScanRow[];
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

  for(const row of ready){
    const path=normalizeRenderPath(row.file.path);
    if(!path||!renderPathInsideRoot(path,exactRoot)){unresolved.push(row);continue}
    readyPhysicalPaths.add(path);

    if(row.classification==='NEW_CANDIDATE'||row.classification==='NEW_GENERATION'){
      createRows.push(row);
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
        status:'READY_UPLOAD',
        storageLifecycle:'NEW',
        scanRecoveryState:undefined,
        error:undefined,
      }
    });
  }

  return{normalizePatches,createRows,readyPhysicalPaths,unresolved}
}

export function publisherReadyPathSet(ready:RenderScanRow[],exactRoot:string){
  const out=new Set<string>();
  for(const row of ready){
    const path=normalizeRenderPath(row.file.path);
    if(path&&renderPathInsideRoot(path,exactRoot))out.add(path);
  }
  return out
}
