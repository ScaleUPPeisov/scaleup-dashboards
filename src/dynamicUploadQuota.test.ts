import {beforeEach,describe,expect,it} from 'vitest';
import {DEFAULT_YOUTUBE_VIDEO_UPLOADS,nextYoutubeQuotaResetAt,planYoutubeQuota,recordYoutubeApiRequest,registerYoutubeUploadProject,releaseYoutubeQuotaReservation,reserveYoutubeQuota,resetYoutubeUploadQuotaLimit,setYoutubeUploadQuotaLimit,youtubeQuotaProjectIdentity,youtubeUploadQuotaState} from './youtubeQuota';

class MemoryStorage {
 private data=new Map<string,string>();
 getItem(k:string){return this.data.has(k)?this.data.get(k)!:null}
 setItem(k:string,v:string){this.data.set(k,String(v))}
 removeItem(k:string){this.data.delete(k)}
 clear(){this.data.clear()}
 key(i:number){return Array.from(this.data.keys())[i]??null}
 get length(){return this.data.size}
}
const storage=new MemoryStorage();
Object.defineProperty(globalThis,'localStorage',{value:storage,configurable:true});
const LEDGER='vyron:youtube-quota-ledger:v3';
const PROJECT='gcp:project-a';
function legacy89(){localStorage.setItem(LEDGER,JSON.stringify({version:3,ptDate:new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replaceAll('/','-'),buckets:{general:{limit:10000,used:1489,calls:20},videoUploads:{limit:100,used:89,calls:89},search:{limit:100,used:0,calls:0}}}))}

describe('dynamic YouTube upload quota per API project',()=>{
 beforeEach(()=>storage.clear());
 it('QUOTA A migrates observed 89 and treats old 100 only as default',()=>{legacy89();const s=registerYoutubeUploadProject(PROJECT);expect(s.used).toBe(89);expect(s.limit).toBe(DEFAULT_YOUTUBE_VIDEO_UPLOADS);expect(s.remaining).toBe(11);expect(s.limitSource).toBe('default');expect(s.configuredLimit).toBeNull()});
 it('QUOTA B supports configured 500 without resetting usage',()=>{legacy89();registerYoutubeUploadProject(PROJECT);const s=setYoutubeUploadQuotaLimit(PROJECT,500);expect(s.used).toBe(89);expect(s.limit).toBe(500);expect(s.remaining).toBe(411);expect(s.limitSource).toBe('user-configured')});
 it('QUOTA C supports configured 1000',()=>{legacy89();registerYoutubeUploadProject(PROJECT);expect(setYoutubeUploadQuotaLimit(PROJECT,1000).remaining).toBe(911)});
 it('QUOTA D does not invent remaining when project identity is unknown',()=>{const s=youtubeUploadQuotaState(null);expect(s.limit).toBeNull();expect(s.remaining).toBeNull();expect(s.limitSource).toBe('unknown')});
 it('QUOTA E plan can fit a batch of 30 when 411 remain',()=>{legacy89();registerYoutubeUploadProject(PROJECT);setYoutubeUploadQuotaLimit(PROJECT,500);const p=planYoutubeQuota([{method:'videos.insert',count:30}],undefined,PROJECT);expect(p.buckets.videoUploads.available).toBe(411);expect(p.buckets.videoUploads.affordable).toBe(true)});
 it('QUOTA F reports partial capacity without pretending a 30 item batch is affordable',()=>{legacy89();registerYoutubeUploadProject(PROJECT);const p=planYoutubeQuota([{method:'videos.insert',count:30}],undefined,PROJECT);expect(p.buckets.videoUploads.available).toBe(11);expect(p.buckets.videoUploads.affordable).toBe(false)});
 it('QUOTA G resets observed usage on a new Pacific quota day but preserves configured limit',()=>{localStorage.setItem(LEDGER,JSON.stringify({version:4,ptDate:'2026-09-11',buckets:{general:{limit:10000,used:12,calls:2},search:{limit:100,used:0,calls:0}},uploadProjects:{[PROJECT]:{quotaDay:'2026-09-11',used:89,calls:89,configuredLimit:500,limitSource:'user-configured',lastUpdatedAt:'2026-09-11T20:00:00Z'}}}));const s=youtubeUploadQuotaState(PROJECT,new Date('2026-09-12T20:00:00Z'));expect(s.quotaDay).toBe('2026-09-12');expect(s.used).toBe(0);expect(s.limit).toBe(500)});
 it('QUOTA H computes Pacific reset with DST rather than fixed UTC-8',()=>{expect(nextYoutubeQuotaResetAt(new Date('2026-03-08T20:00:00Z')).toISOString()).toBe('2026-03-09T07:00:00.000Z');expect(nextYoutubeQuotaResetAt(new Date('2026-11-01T20:00:00Z')).toISOString()).toBe('2026-11-02T08:00:00.000Z')});
 it('QUOTA I channels using the same OAuth client resolve to one shared project key',()=>{const cfg={projectId:'shared-project',clientIdMasked:'12345678…abc123'};const a=youtubeQuotaProjectIdentity({clientIdMasked:'12345678…abc123'},cfg),b=youtubeQuotaProjectIdentity({clientIdMasked:'12345678…abc123'},cfg);expect(a.projectKey).toBe('gcp:shared-project');expect(b.projectKey).toBe(a.projectKey);setYoutubeUploadQuotaLimit(a.projectKey!,500);const plan=planYoutubeQuota([{method:'videos.insert',count:1}],undefined,a.projectKey!);reserveYoutubeQuota('upload-a',plan,a.projectKey!);recordYoutubeApiRequest({method:'videos.insert',operationId:'upload-a'});expect(youtubeUploadQuotaState(b.projectKey!).used).toBe(1);releaseYoutubeQuotaReservation('upload-a')});
 it('QUOTA J different API projects keep usage isolated',()=>{setYoutubeUploadQuotaLimit('gcp:a',500);setYoutubeUploadQuotaLimit('gcp:b',500);const p=planYoutubeQuota([{method:'videos.insert',count:1}],undefined,'gcp:a');reserveYoutubeQuota('op-a',p,'gcp:a');recordYoutubeApiRequest({method:'videos.insert',operationId:'op-a'});expect(youtubeUploadQuotaState('gcp:a').used).toBe(1);expect(youtubeUploadQuotaState('gcp:b').used).toBe(0);releaseYoutubeQuotaReservation('op-a')});
 it('QUOTA K preflight planning never increments observed usage',()=>{registerYoutubeUploadProject(PROJECT);planYoutubeQuota([{method:'videos.insert',count:30}],undefined,PROJECT);expect(youtubeUploadQuotaState(PROJECT).used).toBe(0)});
 it('QUOTA L an actual accounted videos.insert increments exactly once',()=>{registerYoutubeUploadProject(PROJECT);const p=planYoutubeQuota([{method:'videos.insert',count:1}],undefined,PROJECT);reserveYoutubeQuota('real-op',p,PROJECT);recordYoutubeApiRequest({method:'videos.insert',operationId:'real-op'});expect(youtubeUploadQuotaState(PROJECT).used).toBe(1);releaseYoutubeQuotaReservation('real-op')});
 it('QUOTA M project counter persists in local storage across subsequent reads',()=>{registerYoutubeUploadProject(PROJECT);const p=planYoutubeQuota([{method:'videos.insert',count:1}],undefined,PROJECT);reserveYoutubeQuota('persist-op',p,PROJECT);recordYoutubeApiRequest({method:'videos.insert',operationId:'persist-op'});releaseYoutubeQuotaReservation('persist-op');expect(youtubeUploadQuotaState(PROJECT).used).toBe(1);expect(JSON.parse(localStorage.getItem(LEDGER)!).version).toBe(4)});
 it('QUOTA N switching channels on the same project never resets the shared counter',()=>{const cfg={projectId:'shared',clientIdMasked:'client…masked'},keyA=youtubeQuotaProjectIdentity({clientIdMasked:'client…masked'},cfg).projectKey!,keyB=youtubeQuotaProjectIdentity({clientIdMasked:'client…masked'},cfg).projectKey!;const p=planYoutubeQuota([{method:'videos.insert',count:1}],undefined,keyA);reserveYoutubeQuota('switch-op',p,keyA);recordYoutubeApiRequest({method:'videos.insert',operationId:'switch-op'});releaseYoutubeQuotaReservation('switch-op');expect(youtubeUploadQuotaState(keyB).used).toBe(1);resetYoutubeUploadQuotaLimit(keyB);expect(youtubeUploadQuotaState(keyA).used).toBe(1)});
});
