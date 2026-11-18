import type {ImmutableUploadJob} from './uploadQueue';

export type CurrentFileProof={fingerprint:string;size:number;modifiedAt?:number};
/** Verify current disk bytes just before invoking a new YouTube upload session. */
export async function verifyQueuedSourceFingerprint(
  spec:Pick<ImmutableUploadJob,'filePath'|'fingerprint'|'fileSize'>,
  fullFileSha256:(path:string)=>Promise<CurrentFileProof>
):Promise<void>{
  const proof=await fullFileSha256(spec.filePath);
  if(proof.size!==spec.fileSize||proof.fingerprint.trim().toLowerCase()!==spec.fingerprint.trim().toLowerCase()){
    throw new Error('UPLOAD_QUEUE_SOURCE_CHANGED: physical file no longer matches immutable queued fingerprint; recheck before retry');
  }
}
