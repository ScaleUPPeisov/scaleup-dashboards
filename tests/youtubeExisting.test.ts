import {describe,it,expect} from 'vitest';
import {buildExistingSchedule,orderedExistingVideos,overlayExistingMetadata} from '../src/youtubeExisting';
const v=(id:string)=>({id,position:0,title:id,description:'',tags:[],categoryId:'10',privacyStatus:'private',selected:true});
describe('existing youtube manager',()=>{
 it('orders oldest first',()=>expect(orderedExistingVideos([v('new'),v('old')],'oldest').map(x=>x.id)).toEqual(['old','new']));
 it('builds cadence schedule',()=>{const r=buildExistingSchedule([v('1'),v('2')],'2026-09-01T10:00:00.000Z',2);expect(r[1].publishAt).toBe('2026-09-03T10:00:00.000Z')});
 it('overlays metadata',()=>expect(overlayExistingMetadata([v('1')],[{title:'A',description:'B',tags:['x'],source:'x'}])[0].title).toBe('A'));
});
