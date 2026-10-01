import {describe,expect,it} from 'vitest';
import {metadataQueueInput,metadataQueueLowStockThreshold,metadataQueuePublishAtIsFuture,metadataQueueRowAsImported} from './metadataQueue';

describe('VYRON 6.1.0 Metadata Queue frontend contracts',()=>{
  it('has no fixed 50-record assumption in queue helpers',()=>{
    expect(metadataQueueLowStockThreshold(20)).toBe(40);
    expect(metadataQueueLowStockThreshold(5000)).toBe(10000);
  });
  it('keeps SEO fields intact when mapping parsed records',()=>{
    const input=metadataQueueInput({number:501,title:'Title',description:'Description',tags:['a','b'],publishAt:'2026-10-02T18:00:00+07:00',source:'pack.docx'});
    expect(input).toMatchObject({sourceNumber:501,title:'Title',description:'Description',tags:['a','b']});
  });
  it('maps a reserved queue record back to publisher metadata without losing fields',()=>{
    const row=metadataQueueRowAsImported({
      id:'r1',channelId:'UC1',packId:'p1',sequence:17,title:'T',description:'D',tags:['x'],
      publishAt:'2026-10-02T18:00:00+07:00',status:'RESERVED',createdAt:'2026-10-01T00:00:00Z',
      sourceHash:'s',recordHash:'r'
    });
    expect(row.number).toBe(17);
    expect(row.source).toBe('queue:p1:r1');
    expect(row.tags).toEqual(['x']);
  });
  it('never treats a past queue date as a future schedule',()=>{
    expect(metadataQueuePublishAtIsFuture('2020-01-01T00:00:00Z',Date.parse('2026-10-01T00:00:00Z'))).toBe(false);
    expect(metadataQueuePublishAtIsFuture('2026-10-02T00:00:00Z',Date.parse('2026-10-01T00:00:00Z'))).toBe(true);
  });
});
