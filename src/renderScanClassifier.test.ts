import {describe,expect,it} from 'vitest';
import type {RenderFolderVideoFile} from './api';
import type {UploadHistoryRecord,VideoJob} from './types';
import {classifyChannelRenderFiles,crossChannelScanRecoveryJobs,planRenderScanImport,summarizeRenderScan} from './renderScanClassifier';

const root='/workspace/Render/Glass City Lovers';
const file=(n:number,pathRoot=root):RenderFolderVideoFile=>({path:`${pathRoot}/${String(n).padStart(3,'0')} — Ready Videos.mov`,name:`${String(n).padStart(3,'0')} — Ready Videos.mov`,size:500_000_000,createdAt:1000+n,modifiedAt:2000+n});
const job=(channelId:string,n:number,pathRoot=root,extra:Partial<VideoJob>={}):VideoJob=>({id:`${channelId}-${n}`,channelId,number:n,folder:pathRoot,status:'READY_UPLOAD',createdAt:'2026-09-20T00:00:00Z',tracksCount:15,minTracks:15,finalPath:file(n,pathRoot).path,title:`VIDEO_${n}`,description:'',tags:[],storageLifecycle:'NEW',...extra});
const uploaded=(j:VideoJob,id='YT1'):UploadHistoryRecord=>({id:'u-'+j.id,jobId:j.id,channelId:j.channelId,youtubeVideoId:id,localFilePath:j.finalPath!,originalFilename:j.finalPath!.split('/').at(-1)!,uploadedAt:'2026-09-20T00:00:00Z',fileSize:1,sha256:'abc',status:'UPLOADED'});

describe('RC7 channel-scoped render scan',()=>{
  it('classifies 29 physical files into exactly 29 primary categories',()=>{
    const rows=classifyChannelRenderFiles(Array.from({length:29},(_,i)=>file(i+1)),[],[],'glass',root);
    const s=summarizeRenderScan(rows);
    expect(s.TOTAL_CLASSIFIED_FILES).toBe(29);
    expect(s.NEW_CANDIDATE).toBe(29);
    expect(s.KNOWN_EXACT+s.UPLOADED_LOCAL_COPY+s.NEW_CANDIDATE+s.VERIFY_REQUIRED+s.AMBIGUOUS+s.DUPLICATE_LOCAL+s.INVALID).toBe(29);
  });
  it('never double counts verify as ambiguous',()=>{
    const existing=job('glass',1,'/old',{youtubeVideoId:'YT1',storageLifecycle:'UPLOADED'});
    const rows=classifyChannelRenderFiles([file(1)],[existing],[uploaded(existing)],'glass',root);
    const s=summarizeRenderScan(rows);
    expect(s.VERIFY_REQUIRED).toBe(1);expect(s.AMBIGUOUS).toBe(0);expect(s.TOTAL_CLASSIFIED_FILES).toBe(1);
  });
  it('same sequence in another channel never collides',()=>{
    const rows=classifyChannelRenderFiles([file(1)],[job('neon',1,'/workspace/Render/Neon Drive FM')],[],'glass',root);
    expect(rows[0].classification).toBe('NEW_CANDIDATE');
  });
  it('existing YouTube proof makes a physical local copy non-new',()=>{
    const j=job('glass',1,root,{youtubeVideoId:'YT_EXISTING',storageLifecycle:'UPLOADED'});
    const rows=classifyChannelRenderFiles([file(1)],[j],[uploaded(j,'YT_EXISTING')],'glass',root);
    expect(rows[0].classification).toBe('UPLOADED_LOCAL_COPY');
  });
  it('marks bad RC6 global-scan jobs outside exact channel root for metadata-only recovery',()=>{
    const bad=job('glass',1,'/workspace/Render/Neon Drive FM',{sourceOrigin:'render-scan'});
    expect(crossChannelScanRecoveryJobs([bad],[],'glass',root).map(x=>x.id)).toEqual([bad.id]);
  });
  it('adds all 12 true candidates and becomes idempotent after import',()=>{
    const rows=classifyChannelRenderFiles(Array.from({length:12},(_,i)=>file(i+1)),[],[],'glass',root);
    const plan=planRenderScanImport(rows,[]);
    expect(plan.accepted).toHaveLength(12);expect(plan.skipped).toHaveLength(0);
    const imported=plan.accepted.map(r=>job('glass',r.sequence!,root));
    const second=classifyChannelRenderFiles(Array.from({length:12},(_,i)=>file(i+1)),imported,[],'glass',root);
    expect(summarizeRenderScan(second).NEW_CANDIDATE).toBe(0);
  });
  it('rejects backend rows outside exact root as invalid',()=>{
    const rows=classifyChannelRenderFiles([file(1,'/workspace/Render/Neon Drive FM')],[],[],'glass',root);
    expect(rows[0].classification).toBe('INVALID');expect(rows[0].reason).toBe('OUTSIDE_EXACT_CHANNEL_ROOT');
  });
});
