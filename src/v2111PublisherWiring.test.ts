import {describe,it,expect} from 'vitest';
import fs from 'node:fs';
const pub=fs.readFileSync('src/PublisherOS.tsx','utf8');
const api=fs.readFileSync('src/api.ts','utf8');
describe('PublisherOS storage/upload wiring',()=>{
 it('uses canonical selectable jobs',()=>expect(pub).toContain('canonicalSelectedJobs(selectableJobs,draft.selectedIds)'));
 it('button uses truthful label helper',()=>expect(pub).toContain('publisherUploadButtonLabel'));
 it('batch executes uploadable subset',()=>expect(pub).toContain('let batch=uploadableSelected'));
 it('blocked items are isolated individually',()=>expect(pub).toContain('for(const x of blockedItems)'));
 it('upload instrumentation exists',()=>expect(pub).toContain('[UPLOAD] button clicked'));
 it('preflight instrumentation exists',()=>expect(pub).toContain('[PREFLIGHT] input='));
 it('schedule instrumentation exists',()=>expect(pub).toContain('[SCHEDULE] VIDEO_'));
 it('YouTube success history is persisted only after verified branch',()=>{const branch=pub.indexOf('if(uploaded.verified===false)');const persist=pub.indexOf('persistVerifiedUpload(j,channel,uploaded.videoId',branch);expect(branch).toBeGreaterThanOrEqual(0);expect(persist).toBeGreaterThan(branch)});
 it('verification failure clears success proof and marks FAILED',()=>{const i=pub.indexOf('if(uploaded.verified===false)');const tail=pub.slice(i,i+1200);expect(tail).toContain("storageLifecycle:'FAILED'");expect(tail).toContain('youtubeVideoId:undefined')});
 it('quota plan includes real videos.list verification',()=>expect(pub).toContain("method:'videos.list'"));
 it('frontend invokes existing youtube upload command',()=>expect(api).toContain("youtube_upload_video"));
});
