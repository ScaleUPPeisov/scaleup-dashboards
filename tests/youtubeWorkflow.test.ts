import {describe,it,expect} from 'vitest';
import {countBuckets,existingBucket,latestPrivateIds,matchesExistingFilter,selectedVisibleIds} from '../src/youtubeWorkflow';
const v=(id:string,privacyStatus:string,publishAt?:string,publishedAt?:string)=>({id,privacyStatus,publishAt,publishedAt,title:id,description:'',tags:[],categoryId:'10',position:0,selected:false} as any);
describe('youtube workflow isolation',()=>{
 it('separates unscheduled private from scheduled',()=>{expect(existingBucket(v('a','private'))).toBe('private');expect(existingBucket(v('b','private','2026-09-02T00:00:00Z'))).toBe('scheduled')});
 it('does not mix public into private selection',()=>{const rows=[v('p','private'),v('s','private','2026-09-02T00:00:00Z'),v('u','unlisted'),v('x','public')];expect([...selectedVisibleIds(rows,'private')]).toEqual(['p']);expect(matchesExistingFilter(rows[3],'private')).toBe(false);expect(countBuckets(rows)).toEqual({private:1,scheduled:1,public:1,unlisted:1})});
 it('selects newest unscheduled private only',()=>{const rows=[v('1','private',undefined,'2026-08-01T00:00:00Z'),v('2','private',undefined,'2026-09-01T00:00:00Z'),v('3','private','2026-09-03T00:00:00Z','2026-09-02T00:00:00Z')];expect([...latestPrivateIds(rows,1)]).toEqual(['2'])});
});
