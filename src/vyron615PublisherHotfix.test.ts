import {describe,expect,it} from 'vitest';
import type {VideoJob} from './types';
import type {RenderScanRow} from './renderScanClassifier';
import {readyRows} from './renderInventoryRuntime';
import {publisherInventoryJobs,reconcilePublisherInventory} from './publisherInventoryReconcile';
import {
  normalizeYoutubeTags,
  retryableYoutubeMetadataState,
  sanitizeYoutubeTags,
  validateYoutubeTags,
  youtubeMetadataErrorCode,
  youtubeTagsEffectiveLength,
} from './youtubeMetadataValidation';

const hash='a'.repeat(64);
const root='/Volumes/TOSHIBA EXT/Render/Test Channel';
const path=root+'/VIDEO_022.mov';

function job(patch:Partial<VideoJob>={}):VideoJob{
  return{
    id:'job-22',
    channelId:'channel-1',
    number:22,
    folder:root,
    status:'READY_UPLOAD',
    createdAt:'2026-10-04T00:00:00.000Z',
    tracksCount:10,
    minTracks:10,
    finalPath:path,
    title:'VIDEO_022',
    description:'description',
    tags:['one'],
    storageLifecycle:'NEW',
    currentSourceFingerprint:hash,
    currentSourceFileSize:500_000_000,
    currentSourceModifiedAt:1,
    sourceGenerationKey:`channel-1:${hash}:500000000`,
    ...patch,
  }
}

function knownRow():RenderScanRow{
  return{
    file:{path,name:'VIDEO_022.mov',size:500_000_000,modifiedAt:1,fingerprint:hash},
    sequence:22,
    matchedJobId:'job-22',
    classification:'KNOWN_EXACT',
    reason:'CURRENT_GENERATION_FINGERPRINT_MATCH',
    currentFingerprint:hash,
    currentFileSize:500_000_000,
  }
}

describe('VYRON 6.1.5 Publisher hide recovery',()=>{
  it('fresh physical truth overrides legacy removedFromPublishList without a duplicate',()=>{
    const hidden=job({removedFromPublishList:true});
    const physical=readyRows([knownRow()],[hidden]);
    expect(physical).toHaveLength(1);

    const rec=reconcilePublisherInventory({channelId:'channel-1',exactRoot:root,ready:physical,jobs:[hidden]});
    expect(rec.createRows).toHaveLength(0);
    expect(rec.normalizePatches).toHaveLength(1);
    expect(rec.normalizePatches[0]).toMatchObject({
      id:'job-22',
      patch:{removedFromPublishList:false,status:'READY_UPLOAD',storageLifecycle:'NEW',finalPath:path},
    });

    const restored={...hidden,...rec.normalizePatches[0].patch};
    const visible=publisherInventoryJobs({
      jobs:[restored],
      channelId:'channel-1',
      readyPhysicalPaths:new Set([path]),
    });
    expect(visible.map(x=>x.id)).toEqual(['job-22']);
  });

  it('fresh physical truth recovers a legacy invalidTags ERROR/FAILED job',()=>{
    const failed=job({
      status:'ERROR',
      storageLifecycle:'FAILED',
      error:'YOUTUBE_UPLOAD_INIT 400 Bad Request: invalidTags: invalid video keywords',
    });
    const physical=readyRows([knownRow()],[failed]);
    expect(physical).toHaveLength(1);

    const rec=reconcilePublisherInventory({channelId:'channel-1',exactRoot:root,ready:physical,jobs:[failed]});
    expect(rec.createRows).toHaveLength(0);
    expect(rec.restoredJobIds).toEqual(['job-22']);
    expect(rec.normalizePatches[0].patch).toMatchObject({
      status:'READY_UPLOAD',
      storageLifecycle:'NEW',
      removedFromPublishList:false,
      finalPath:path,
    });
  });

  it('does not make an explicitly trashed file ready again',()=>{
    const trashed=job({storageLifecycle:'TRASHED_BY_VYRON'});
    expect(readyRows([knownRow()],[trashed])).toEqual([]);
  });

  it('does not make an uploaded file ready again',()=>{
    const uploaded=job({
      status:'SCHEDULED',
      storageLifecycle:'UPLOADED',
      youtubeVideoId:'youtube-id',
      uploadedAt:'2026-10-04T01:00:00.000Z',
    });
    expect(readyRows([knownRow()],[uploaded])).toEqual([]);
  });
});

describe('VYRON 6.1.5 YouTube tag validation',()=>{
  it('counts commas and YouTube quote-cost for tags containing whitespace',()=>{
    expect(youtubeTagsEffectiveLength(['alpha','beta gamma'])).toBe(18);
    expect(youtubeTagsEffectiveLength(['a','b','c'])).toBe(5);
  });

  it('normalizes blanks and exact duplicate tags while preserving first occurrence',()=>{
    expect(normalizeYoutubeTags([' first ','','first','second'])).toEqual(['first','second']);
  });

  it('sanitizes raw-looking-valid metadata whose YouTube effective length exceeds 500',()=>{
    const tags=Array.from({length:100},(_,i)=>`a ${i}`);
    const simpleLength=tags.join(',').length;
    const before=youtubeTagsEffectiveLength(tags);
    expect(simpleLength).toBeLessThanOrEqual(500);
    expect(before).toBeGreaterThan(500);

    const result=sanitizeYoutubeTags(tags);
    expect(result.changed).toBe(true);
    expect(result.afterCount).toBeLessThan(result.beforeCount);
    expect(result.afterEffectiveLength).toBeLessThanOrEqual(500);
    expect(validateYoutubeTags(result.tags).valid).toBe(true);
    expect(result.tags).toEqual(tags.slice(0,result.afterCount));
  });

  it('only truncates content for one pathological tag',()=>{
    const result=sanitizeYoutubeTags(['word '.repeat(150)]);
    expect(result.tags).toHaveLength(1);
    expect(result.afterEffectiveLength).toBeLessThanOrEqual(500);
  });
});

describe('VYRON 6.1.5 retryable YouTube metadata errors',()=>{
  it('classifies invalidTags as retryable READY_UPLOAD/NEW when no videoId exists',()=>{
    const error='YOUTUBE_UPLOAD_INIT 400 Bad Request: The request metadata specifies invalid video keywords. [invalidTags]';
    expect(youtubeMetadataErrorCode(error)).toBe('invalidTags');
    expect(retryableYoutubeMetadataState(error)).toEqual({
      code:'invalidTags',
      status:'READY_UPLOAD',
      storageLifecycle:'NEW',
      uploadProgress:0,
    });
  });

  it('covers equivalent metadata validation codes without broadening generic upload errors',()=>{
    for(const code of ['invalidTitle','invalidDescription','invalidPublishAt','invalidCategoryId','invalidVideoMetadata']){
      expect(youtubeMetadataErrorCode(`400 ${code}`)).toBe(code);
      expect(retryableYoutubeMetadataState(`400 ${code}`)).toBeTruthy();
    }
    expect(retryableYoutubeMetadataState('network timeout')).toBeUndefined();
    expect(retryableYoutubeMetadataState('400 invalidTags','accepted-id')).toBeUndefined();
  });
});
