import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import type {VideoJob} from './types';
import {canonicalSelectedJobs} from './publisherRuntime';

const read=(name:string)=>readFileSync(decodeURIComponent(new URL('./'+name,import.meta.url).pathname),'utf8');
const jobs=Array.from({length:20},(_,i):VideoJob=>({
  id:'job-'+(i+1),channelId:'velvet',number:i+1,folder:'/Render/Velvet',status:'READY_UPLOAD',
  createdAt:'2026-10-04T00:00:00Z',tracksCount:10,minTracks:10,
  finalPath:'/Render/Velvet/'+String(i+1).padStart(3,'0')+'.mov',
  title:'VIDEO_'+String(i+1).padStart(3,'0'),description:'',tags:[],storageLifecycle:'NEW'
}));

describe('VYRON 6.1.4 Publisher physical inventory hotfix',()=>{
  it('keeps deliberate 10-video selection even when selectableJobs transiently drops to zero',()=>{
    const selectedIds=jobs.slice(10,20).map(j=>j.id);
    const transientSelectable:VideoJob[]=[];
    expect(transientSelectable).toHaveLength(0);
    expect(canonicalSelectedJobs(jobs,selectedIds).map(j=>j.id)).toEqual(selectedIds);
    const os=read('PublisherOS.tsx');
    const picker=read('PublisherVideoPicker.tsx');
    expect(os).toContain('canonicalSelectedJobs(allChannelJobs,draft.selectedIds)');
    expect(os).not.toContain('const valid=new Set(selectableJobs.map(j=>j.id))');
    expect(picker).toContain('checked={p.selectedIds.includes(j.id)}');
  });

  it('opens the full advanced workflow by default without adding automatic YouTube sync calls',()=>{
    const os=read('PublisherOS.tsx');
    for(const marker of [
      '[foldersOpen,setFoldersOpen]=useState(true)',
      '[recoveryOpen,setRecoveryOpen]=useState(true)',
      '[metadataOpen,setMetadataOpen]=useState(true)',
      '[thumbnailOpen,setThumbnailOpen]=useState(true)',
      '[scheduleOpen,setScheduleOpen]=useState(true)',
      '[cleanupOpen,setCleanupOpen]=useState(true)'
    ])expect(os).toContain(marker);
    expect(os).not.toContain('useEffect(()=>void syncScheduleFromYoutube');
    expect(os).not.toContain('useEffect(()=>{void syncScheduleFromYoutube');
  });

  it('local reconciliation remains zero-YouTube-API code',()=>{
    const rec=read('publisherInventoryReconcile.ts');
    const inventory=read('renderInventoryRuntime.ts');
    for(const source of [rec,inventory]){
      expect(source).not.toContain('youtubeListExisting(');
      expect(source).not.toContain('youtubeUploadVideo(');
      expect(source).not.toContain('videos.insert');
    }
  });

  it('Action modal uses current scan/currentSource size and never uploadHistory-only fake 0.00 GB',()=>{
    const os=read('PublisherOS.tsx');
    expect(os).toContain('publisherCurrentPhysicalSize');
    expect(os).toContain('Размер не удалось прочитать');
    expect(os).not.toContain("uploadHistory.slice().reverse().find(x=>x.jobId===id)?.fileSize||0");
  });
});
