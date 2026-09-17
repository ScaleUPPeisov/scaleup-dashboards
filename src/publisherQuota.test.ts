import {describe,expect,it} from 'vitest';import {publisherVideoCapacity,quotaDelta} from './publisherQuota';
describe('publisher quota capacity',()=>{
 it('caps capacity by selected batch, not raw remaining quota',()=>expect(publisherVideoCapacity(411,null,30).canUploadToday).toBe(30));
 it('reports partial capacity when project quota is lower than batch',()=>expect(publisherVideoCapacity(11,null,30).canUploadToday).toBe(11));
 it('returns zero when no video is selected',()=>expect(publisherVideoCapacity(411,null,0).canUploadToday).toBe(0));
 it('does not invent capacity when upload limit is unknown but still respects selection',()=>expect(publisherVideoCapacity(null,null,30)).toEqual({byQuota:null,safeRemaining:null,selectedCount:30,canUploadToday:30}));
 it('also respects user safe limit when present',()=>expect(publisherVideoCapacity(37,4,30).canUploadToday).toBe(4));
 it('reports plan/fact delta',()=>expect(quotaDelta(100,52)).toEqual({planned:100,actual:52,difference:-48}));
});
