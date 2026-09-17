import {describe,it,expect} from 'vitest';
import {createJobsCount,imageAllocation,musicAllocation} from '../src/autopilotCore';
const job=(id:string,n:number,tracks=0,cover?:string)=>({id,channelId:'c',number:n,folder:'/x',status:'WAITING_MUSIC',createdAt:'x',tracksCount:tracks,minTracks:10,title:'',description:'',tags:[],coverPath:cover} as any);
describe('autopilot allocation',()=>{
 it('fills music without crossing jobs',()=>{const r=musicAllocation([job('a',1,8),job('b',2,0)],['1','2','3','4','5'],10);expect(r[0]).toEqual({jobId:'a',files:['1','2']});expect(r[1].files).toEqual(['3','4','5'])});
 it('assigns one image per missing cover',()=>{const r=imageAllocation([job('a',1,0,'cover.jpg'),job('b',2),job('c',3)],['x.jpg','y.jpg']);expect(r).toEqual([{jobId:'b',file:'x.jpg'},{jobId:'c',file:'y.jpg'}])});
});

describe('manual batch planning',()=>{it('creates exact 10 and 100 projects without hardcoded small cap',()=>{const c:any={id:'c',name:'C',slug:'c',cadenceDays:2,targetBufferDays:60,publishHour:18,publishMinute:0,language:'EN',genre:'Music',country:'US',minTracks:10,targetDurationMin:120,enabled:true,seo:{titlePatterns:['Mix {number}'],descriptionTemplate:'x',tags:[],banned:[]}};expect(createJobsCount(c,[],10)).toHaveLength(10);expect(createJobsCount(c,[],100)).toHaveLength(100);expect(createJobsCount(c,[],5000)).toHaveLength(5000)})});
