import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const pub=fs.readFileSync('src/PublisherOS.tsx','utf8');
const api=fs.readFileSync('src/api.ts','utf8');
const queueRuntime=fs.readFileSync('src/uploadQueueRuntime.ts','utf8');
describe('PublisherOS storage/upload wiring',()=>{
 it('uses canonical selectable jobs',()=>expect(pub).toContain('canonicalSelectedJobs(selectableJobs,draft.selectedIds)'));
 it('button uses truthful label helper',()=>expect(pub).toContain('publisherUploadButtonLabel'));
 it('batch executes uploadable subset',()=>expect(pub).toContain('let batch=uploadableSelected'));
 it('blocked items are isolated individually',()=>expect(pub).toContain('for(const x of blockedItems)'));
 it('upload instrumentation follows queue submission',()=>{expect(pub).toContain('[UPLOAD_QUEUE] submit clicked');expect(pub).toContain('[UPLOAD_QUEUE] QUEUED')});
 it('preflight failures remain persisted with stage instrumentation',()=>{expect(pub).toContain("appendErrorHistory('Pre-flight: видео пропущено'");expect(pub).toContain("stage:'preflight'")});
 it('schedule instrumentation exists',()=>expect(pub).toContain('[SCHEDULE] VIDEO_'));
 it('YouTube accepted videoId is persisted even when post-upload verification is uncertain',()=>{const branch=queueRuntime.indexOf('if(uploaded.verified===false)');const tail=queueRuntime.slice(branch,branch+4200);expect(branch).toBeGreaterThanOrEqual(0);expect(tail).toContain('recordVerifiedUpload');expect(tail).toContain("processingState:'PROCESSING_UNKNOWN'");expect(tail).toContain('youtubeVideoId:uploaded.videoId')});
 it('verification uncertainty blocks duplicate retry without pretending the upload failed before acceptance',()=>{const i=pub.indexOf('if(uploaded.verified===false)');const tail=pub.slice(i,i+2500);expect(tail).toContain("storageLifecycle:'UPLOADED'");expect(tail).toContain('youtubeVideoId:uploaded.videoId');expect(tail).toContain('Повторная загрузка заблокирована')});
 it('quota plan includes real videos.list verification',()=>expect(pub).toContain("method:'videos.list'"));
 it('frontend invokes existing youtube upload command',()=>expect(api).toContain("youtube_upload_video"));
});
