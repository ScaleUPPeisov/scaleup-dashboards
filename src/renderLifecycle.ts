import type {BatchStatus} from './productionManagerApi';
import type {VideoJob} from './types';

type RenderRow=BatchStatus['projects'][number];

const timeMs=(value?:string|null)=>{
 const ms=value?Date.parse(value):NaN;
 return Number.isFinite(ms)?ms:undefined;
};

export function completedRenderEvidenceId(batchId:string,row:RenderRow){
 return [batchId,row.projectId,row.startedAt||'unknown-start',row.outputFile||''].join('|');
}

export function completedRenderPatch(job:VideoJob,batchId:string,row:RenderRow):Partial<VideoJob>|null{
 if(row.renderStatus!=='Completed'||!row.outputFile)return null;
 const evidenceId=completedRenderEvidenceId(batchId,row);
 if(job.renderEvidenceId===evidenceId)return null;

 const incomingStartedAt=row.startedAt||undefined;
 const incomingMs=timeMs(incomingStartedAt);
 const currentMs=timeMs(job.renderStartedAt);
 if(currentMs!=null&&incomingMs!=null&&incomingMs<=currentMs)return null;

 const uploadedMs=timeMs(job.uploadedAt);
 const hasUploadProof=Boolean(job.youtubeVideoId||job.uploadedAt||job.storageLifecycle==='UPLOADED'||job.status==='SCHEDULED');

 // Existing installations did not persist renderEvidenceId. When an old completed
 // row predates the verified upload, seed its identity without rolling the job back.
 if(!job.renderEvidenceId&&hasUploadProof&&(incomingMs==null||(uploadedMs!=null&&incomingMs<=uploadedMs))){
  return{renderEvidenceId:evidenceId,renderStartedAt:incomingStartedAt};
 }

 // A newer physical render supersedes only the current job upload markers.
 // Persistent uploadHistory remains untouched and still protects the old SHA-256.
 return{
  status:'READY_UPLOAD',
  finalPath:row.outputFile,
  error:undefined,
  storageLifecycle:'RENDERED',
  youtubeVideoId:undefined,
  uploadedAt:undefined,
  uploadFingerprint:undefined,
  uploadProgress:0,
  uploadInterruptedAt:undefined,
  removedFromPublishList:false,
  renderEvidenceId:evidenceId,
  renderStartedAt:incomingStartedAt
 };
}
