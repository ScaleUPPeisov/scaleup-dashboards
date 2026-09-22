import {describe,expect,it} from 'vitest';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';
import {buildLegacyRecoveryPreview,canRefreshCurrentGenerationEvidence,classifyChannelRenderFiles,crossChannelScanRecoveryJobs,planRenderScanImport,renderFileNeedsFingerprint,summarizeRenderScan} from './renderScanClassifier';

const root='/workspace/Render/Glass City Lovers';
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
const file=(n:number,pathRoot=root,fingerprint?:string,size=500_000_000):RenderFolderVideoFile=>({path:`${pathRoot}/${String(n).padStart(3,'0')} — Ready Videos.mov`,name:`${String(n).padStart(3,'0')} — Ready Videos.mov`,size,createdAt:1000+n,modifiedAt:2000+n,fingerprint});
const job=(channelId:string,n:number,pathRoot=root,extra:Partial<VideoJob>={}):VideoJob=>({id:`${channelId}-${n}-${Math.random()}`,channelId,number:n,folder:pathRoot,status:'READY_UPLOAD',createdAt:'2026-09-20T00:00:00Z',tracksCount:15,minTracks:15,finalPath:file(n,pathRoot).path,title:`VIDEO_${n}`,description:'',tags:[],storageLifecycle:'NEW',...extra});
const uploaded=(j:VideoJob,id='YT1',sha=A,size=500_000_000,path=j.finalPath!,proof:UploadHistoryRecord['fingerprintProofSource']='UPLOAD_TIME'):UploadHistoryRecord=>({id:'u-'+j.id+'-'+id,jobId:j.id,channelId:j.channelId,youtubeVideoId:id,localFilePath:path,originalFilename:path.split('/').at(-1)!,uploadedAt:'2026-09-20T00:00:00Z',fileSize:size,sha256:sha,status:'UPLOADED',fingerprintProofSource:proof,fingerprintCapturedAt:'2026-09-20T00:00:00Z',sourceGenerationKeyAtUpload:`${j.channelId}:${sha}:${size}`,uploadOperationId:'upload-op',proofSchemaVersion:1});

describe('VYRON generation-aware channel render scan',()=>{
  it('classifies 29 untouched physical files into exactly 29 primary categories',()=>{
    const rows=classifyChannelRenderFiles(Array.from({length:29},(_,i)=>file(i+1)),[],[],'glass',root);
    const s=summarizeRenderScan(rows);
    expect(s.TOTAL_CLASSIFIED_FILES).toBe(29);
    expect(s.NEW_CANDIDATE).toBe(29);
    expect(s.KNOWN_EXACT+s.UPLOADED_LOCAL_COPY+s.NEW_CANDIDATE+s.NEW_GENERATION+s.LEGACY_IDENTITY_UNPROVEN+s.VERIFY_REQUIRED+s.AMBIGUOUS+s.DUPLICATE_LOCAL+s.INVALID).toBe(29);
  });

  it('same path + same trusted fingerprint and size stays uploaded and non-new',()=>{
    const j=job('glass',1,root,{youtubeVideoId:'YT_EXISTING',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const rows=classifyChannelRenderFiles([file(1,root,A)],[j],[uploaded(j,'YT_EXISTING',A)],'glass',root);
    expect(rows[0].classification).toBe('UPLOADED_LOCAL_COPY');
    expect(rows[0].reason).toBe('FINGERPRINT_VERIFIED_EXACT_PATH_UPLOAD');
    expect(rows[0].youtubeVideoId).toBe('YT_EXISTING');
  });

  it('same path + different bytes becomes NEW_GENERATION and preserves historical upload evidence',()=>{
    const j=job('glass',1,root,{youtubeVideoId:'YT_OLD',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(j,'YT_OLD',A,500_000_000);
    const rows=classifyChannelRenderFiles([file(1,root,B,505_000_000)],[j],[h],'glass',root);
    expect(rows[0].classification).toBe('NEW_GENERATION');
    expect(rows[0].reason).toBe('EXACT_PATH_PHYSICAL_FINGERPRINT_CHANGED');
    expect(rows[0].youtubeVideoId).toBe('YT_OLD');
    expect(h.sha256).toBe(A);
  });

  it('same VIDEO number can be reused by a physically different generation after historical upload',()=>{
    const old=job('glass',1,'/old',{youtubeVideoId:'YT_OLD',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_OLD',A,500_000_000,old.finalPath!);
    const rows=classifyChannelRenderFiles([file(1,root,B,505_000_000)],[old],[h],'glass',root);
    expect(rows[0].classification).toBe('NEW_GENERATION');
    const plan=planRenderScanImport(rows,[old]);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.skipped.some(x=>x.reason==='SEQUENCE_ALREADY_USED')).toBe(false);
  });

  it('different path + same same-channel fingerprint is an uploaded local copy',()=>{
    const old=job('glass',7,'/archive',{youtubeVideoId:'YT_OLD',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_OLD',A,500_000_000,old.finalPath!);
    const current=file(21,root,A,500_000_000);
    expect(renderFileNeedsFingerprint({...current,fingerprint:undefined},[old],[h],'glass',root)).toBe(true);
    const row=classifyChannelRenderFiles([current],[old],[h],'glass',root)[0];
    expect(row.classification).toBe('UPLOADED_LOCAL_COPY');
    expect(row.reason).toBe('FINGERPRINT_VERIFIED_SAME_CHANNEL_UPLOAD');
  });

  it('same path legacy YouTube record without trusted SHA becomes NEW_GENERATION when current fingerprint is unseen',()=>{
    const old=job('glass',2,root,{youtubeVideoId:'YT_LEGACY',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_LEGACY','legacy-no-sha',500_000_000);
    const row=classifyChannelRenderFiles([file(2,root,B)],[old],[h],'glass',root)[0];
    expect(row.classification).toBe('NEW_GENERATION');
    expect(row.reason).toBe('LEGACY_HISTORY_WITHOUT_FINGERPRINT_CURRENT_BYTES_UNSEEN');
  });

  it('same fingerprint in another channel does not prove Glass uploaded',()=>{
    const neon=job('neon',9,'/workspace/Render/Neon Drive FM',{youtubeVideoId:'YT_NEON',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(neon,'YT_NEON',A,500_000_000);
    const row=classifyChannelRenderFiles([file(9,root,A)],[],[h],'glass',root)[0];
    expect(row.classification).toBe('NEW_CANDIDATE');
    expect(row.youtubeVideoId).toBeUndefined();
  });

  it('old job.youtubeVideoId alone is never proof of current physical bytes',()=>{
    const old=job('glass',3,root,{youtubeVideoId:'YT_ONLY',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const row=classifyChannelRenderFiles([file(3,root,C)],[old],[],'glass',root)[0];
    expect(row.classification).toBe('NEW_GENERATION');
    expect(row.classification).not.toBe('UPLOADED_LOCAL_COPY');
  });

  it('Select All planning isolates 20 new from 8 verified uploaded and 2 verify-required',()=>{
    const files:RenderFolderVideoFile[]=[],jobs:VideoJob[]=[],history:UploadHistoryRecord[]=[];
    for(let n=1;n<=20;n++)files.push(file(n,root,undefined,400_000_000+n));
    for(let n=21;n<=28;n++){const j=job('glass',n,root,{youtubeVideoId:`YT${n}`,storageLifecycle:'UPLOADED',status:'SCHEDULED'}),sha=(n%2?A:B);files.push(file(n,root,sha,500_000_000));jobs.push(j);history.push(uploaded(j,`YT${n}`,sha,500_000_000))}
    for(let n=29;n<=30;n++){const j=job('glass',n,root,{youtubeVideoId:`LEGACY${n}`,storageLifecycle:'UPLOADED',status:'SCHEDULED'});files.push(file(n,root,C,510_000_000));jobs.push(j);history.push(uploaded(j,`LEGACY${n}`,'missing',510_000_000))}
    const rows=classifyChannelRenderFiles(files,jobs,history,'glass',root),summary=summarizeRenderScan(rows),plan=planRenderScanImport(rows,jobs);
    expect(summary.NEW_CANDIDATE+summary.NEW_GENERATION).toBe(22);
    expect(summary.UPLOADED_LOCAL_COPY).toBe(8);
    expect(summary.LEGACY_IDENTITY_UNPROVEN).toBe(0);
    expect(plan.accepted).toHaveLength(22);
  });

  it('same exact path can replace an unuploaded active generation without path or sequence collision',()=>{
    const active=job('glass',4,root,{id:'active-old',currentSourceFingerprint:A,currentSourceFileSize:500_000_000,sourceGenerationKey:`glass:${A}:500000000`});
    const row=classifyChannelRenderFiles([file(4,root,B,505_000_000)],[active],[],'glass',root)[0];
    expect(row.classification).toBe('NEW_GENERATION');
    expect(row.matchedJobId).toBe('active-old');
    const plan=planRenderScanImport([row],[active]);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it('rescan is idempotent after a NEW_GENERATION current job is materialized',()=>{
    const old=job('glass',1,root,{youtubeVideoId:'YT_OLD',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_OLD',A,500_000_000);
    const current=file(1,root,B,505_000_000);
    const first=classifyChannelRenderFiles([current],[old],[h],'glass',root)[0];
    expect(first.classification).toBe('NEW_GENERATION');
    const fresh=job('glass',1,root,{id:'fresh-generation',currentSourceFingerprint:B,currentSourceFileSize:505_000_000,currentSourceModifiedAt:current.modifiedAt||undefined,sourceGenerationKey:`glass:${B}:505000000`});
    const second=classifyChannelRenderFiles([current],[old,fresh],[h],'glass',root)[0];
    expect(second.classification).toBe('KNOWN_EXACT');
    expect(second.matchedJobId).toBe('fresh-generation');
    expect(planRenderScanImport(second.classification==='NEW_CANDIDATE'||second.classification==='NEW_GENERATION'?[second]:[],[old,fresh]).accepted).toHaveLength(0);
  });

  it('still marks wrong-root current scan jobs for metadata-only recovery',()=>{
    const bad=job('glass',1,'/workspace/Render/Neon Drive FM',{sourceOrigin:'render-scan'});
    expect(crossChannelScanRecoveryJobs([bad],[],'glass',root).map(x=>x.id)).toEqual([bad.id]);
  });

  it('rejects backend rows outside exact root as invalid',()=>{
    const rows=classifyChannelRenderFiles([file(1,'/workspace/Render/Neon Drive FM',A)],[],[],'glass',root);
    expect(rows[0].classification).toBe('INVALID');expect(rows[0].reason).toBe('OUTSIDE_EXACT_CHANNEL_ROOT');
  });

  it('legacy YouTube ID without historical SHA is automatically current NEW when exact fingerprint is unseen',()=>{
    const old=job('glass',11,root,{youtubeVideoId:'YT_LEGACY',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_LEGACY','legacy-no-sha',500_000_000);
    const row=classifyChannelRenderFiles([file(11,root,B,505_000_000)],[old],[h],'glass',root)[0];
    expect(row.classification).toBe('NEW_GENERATION');
    expect(row.reason).toBe('LEGACY_HISTORY_WITHOUT_FINGERPRINT_CURRENT_BYTES_UNSEEN');
    expect(planRenderScanImport([row],[old]).accepted).toHaveLength(1);
  });

  it('legacy recovery never promotes a current fingerprint already uploaded successfully on the same channel',()=>{
    const old=job('glass',12,root,{youtubeVideoId:'YT_LEGACY',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const legacy=uploaded(old,'YT_LEGACY','legacy-no-sha',500_000_000);
    const already=job('glass',99,'/archive',{youtubeVideoId:'YT_DUP',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const proof=uploaded(already,'YT_DUP',C,505_000_000,already.finalPath!);
    const ambiguous=classifyChannelRenderFiles([file(12,root,C,505_000_000)],[old],[legacy],'glass',root)[0];
    const preview=buildLegacyRecoveryPreview([ambiguous],[legacy,proof],'glass');
    expect(preview.newGenerations).toHaveLength(0);
    expect(preview.legacyUnproven).toHaveLength(0);
    expect(preview.duplicates).toHaveLength(1);
    expect(preview.duplicates[0].reason).toContain('YT_DUP');
  });

  it('29 legacy current fingerprints become selectable generations without YouTube ID checks',()=>{
    const files:RenderFolderVideoFile[]=[],jobs:VideoJob[]=[],history:UploadHistoryRecord[]=[];
    for(let n=1;n<=29;n++){
      const old=job('glass',n,root,{youtubeVideoId:`LEGACY_${n}`,storageLifecycle:'UPLOADED',status:'SCHEDULED'});
      const sha=n.toString(16).padStart(64,'0');
      files.push(file(n,root,sha,500_000_000+n));
      jobs.push(old);
      history.push(uploaded(old,`LEGACY_${n}`,'legacy-no-sha',500_000_000+n));
    }
    const beforeHistory=JSON.stringify(history);
    const rows=classifyChannelRenderFiles(files,jobs,history,'glass',root);
    expect(rows.every(x=>x.classification==='NEW_GENERATION')).toBe(true);
    expect(planRenderScanImport(rows,jobs).accepted).toHaveLength(29);
    const preview=buildLegacyRecoveryPreview(rows,history,'glass');
    expect(preview.newGenerations).toHaveLength(29);
    expect(preview.legacyUnproven).toHaveLength(0);
    expect(preview.duplicates).toHaveLength(0);
    expect(JSON.stringify(history)).toBe(beforeHistory);
  });

  it('missing current SHA stays VERIFY_REQUIRED_LEGACY instead of being force-enabled',()=>{
    const old=job('glass',30,root,{youtubeVideoId:'YT_LEGACY',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_LEGACY','legacy-no-sha',500_000_000);
    const row=classifyChannelRenderFiles([{...file(30,root,undefined),fingerprint:undefined}],[old],[h],'glass',root)[0];
    const preview=buildLegacyRecoveryPreview([row],[h],'glass');
    expect(preview.newGenerations).toHaveLength(0);
    expect(preview.legacyUnproven).toHaveLength(0);
    expect(preview.verifyRequired).toHaveLength(1);
  });

  it('trusted historical fingerprint difference is automatically NEW_GENERATION without legacy confirmation',()=>{
    const old=job('glass',31,root,{youtubeVideoId:'YT_OLD',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const h=uploaded(old,'YT_OLD',A,500_000_000);
    const row=classifyChannelRenderFiles([file(31,root,B,505_000_000)],[old],[h],'glass',root)[0];
    expect(row.classification).toBe('NEW_GENERATION');
    const preview=buildLegacyRecoveryPreview([row],[h],'glass');
    expect(preview.newGenerations).toHaveLength(1);
    expect(preview.legacyUnproven).toHaveLength(0);
  });

  it('29 physical renders with 29 historical YouTube jobs keep only exact same-channel fingerprint duplicates blocked',()=>{
    const files:RenderFolderVideoFile[]=[],jobs:VideoJob[]=[],history:UploadHistoryRecord[]=[];
    for(let n=1;n<=29;n++){
      const old=job('glass',n,root,{id:`historical-${n}`,youtubeVideoId:`OLD_YT_${n}`,storageLifecycle:'UPLOADED',status:'SCHEDULED'});
      const currentSha=n.toString(16).padStart(64,'0');
      const size=500_000_000+n;
      files.push(file(n,root,currentSha,size));
      jobs.push(old);
      if(n<=3)history.push(uploaded(old,`OLD_YT_${n}`,currentSha,size));
      else history.push(uploaded(old,`OLD_YT_${n}`,'legacy-no-sha',size));
    }
    const rows=classifyChannelRenderFiles(files,jobs,history,'glass',root),summary=summarizeRenderScan(rows),plan=planRenderScanImport(rows,jobs);
    expect(rows).toHaveLength(29);
    expect(summary.UPLOADED_LOCAL_COPY).toBe(3);
    expect(summary.NEW_GENERATION).toBe(26);
    expect(plan.accepted).toHaveLength(26);
    expect(plan.accepted.every(x=>x.classification==='NEW_GENERATION')).toBe(true);
  });

  it('active old local job with reused sequence cannot block a different current physical render',()=>{
    const old=job('glass',15,'/legacy/local',{id:'active-local-old',sourceOrigin:'render-scan',currentSourceFingerprint:A,currentSourceFileSize:500_000_000});
    const current=file(15,root,B,505_000_000);
    const row=classifyChannelRenderFiles([current],[old],[],'glass',root)[0];
    expect(['NEW_CANDIDATE','NEW_GENERATION']).toContain(row.classification);
    const plan=planRenderScanImport([row],[old]);
    expect(plan.accepted).toHaveLength(1);
    expect(plan.skipped).toHaveLength(0);
  });

  it('never rewrites fingerprint evidence on an uploaded historical generation',()=>{
    const historical=job('glass',1,root,{youtubeVideoId:'YT_OLD',uploadedAt:'2026-09-01T00:00:00Z',storageLifecycle:'UPLOADED',status:'SCHEDULED',currentSourceFingerprint:A,currentSourceFileSize:500_000_000});
    const active=job('glass',2,root,{status:'READY_UPLOAD',storageLifecycle:'NEW',currentSourceFingerprint:B,currentSourceFileSize:505_000_000});
    expect(canRefreshCurrentGenerationEvidence(historical)).toBe(false);
    expect(canRefreshCurrentGenerationEvidence(active)).toBe(true);
  });

  it('remote reconciliation cannot poison reused current path with an old YouTube ID',()=>{
    const old=job('glass',1,root,{id:'historical-1',youtubeVideoId:'ABC123',uploadedAt:'2026-08-01T00:00:00Z',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const poisoned=uploaded(old,'ABC123',B,500_000_000,old.finalPath!,'LEGACY_RECONSTRUCTED');
    const current=file(1,root,B,500_000_000);
    const row=classifyChannelRenderFiles([current],[old],[poisoned],'glass',root)[0];
    expect(row.classification).toBe('NEW_GENERATION');
    expect(row.classification).not.toBe('UPLOADED_LOCAL_COPY');
    expect(row.historyProofSource).toBe('LEGACY_RECONSTRUCTED');
    expect(planRenderScanImport([row],[old]).accepted).toHaveLength(1);
  });

  it('real upload-time proof blocks same bytes, but reused path with new bytes is selectable',()=>{
    const old=job('glass',1,root,{youtubeVideoId:'XYZ',storageLifecycle:'UPLOADED',status:'SCHEDULED'});
    const proof=uploaded(old,'XYZ',B,500_000_000,old.finalPath!,'UPLOAD_TIME');
    expect(classifyChannelRenderFiles([file(1,root,B,500_000_000)],[old],[proof],'glass',root)[0].classification).toBe('UPLOADED_LOCAL_COPY');
    const changed=classifyChannelRenderFiles([file(1,root,C,500_000_001)],[old],[proof],'glass',root)[0];
    expect(changed.classification).toBe('NEW_GENERATION');
    expect(planRenderScanImport([changed],[old]).accepted).toHaveLength(1);
  });

  it('29 Glass current renders poisoned only by reconstructed history remain selectable',()=>{
    const files:RenderFolderVideoFile[]=[],jobs:VideoJob[]=[],history:UploadHistoryRecord[]=[];
    const nums=[...Array.from({length:14},(_,i)=>i+1),...Array.from({length:15},(_,i)=>i+16)];
    for(const n of nums){const old=job('glass',n,root,{id:`old-${n}`,youtubeVideoId:`YT_${n}`,storageLifecycle:'UPLOADED',status:'SCHEDULED'}),sha=n.toString(16).padStart(64,'0'),size=500_000_000+n;files.push(file(n,root,sha,size));jobs.push(old);history.push(uploaded(old,`YT_${n}`,sha,size,old.finalPath!,'LEGACY_RECONSTRUCTED'));}
    const rows=classifyChannelRenderFiles(files,jobs,history,'glass',root),summary=summarizeRenderScan(rows),plan=planRenderScanImport(rows,jobs);
    expect(rows).toHaveLength(29);expect(summary.UPLOADED_LOCAL_COPY).toBe(0);expect(summary.NEW_GENERATION).toBe(29);expect(plan.accepted).toHaveLength(29);
  });

});
