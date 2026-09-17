import {describe,expect,it} from 'vitest';
import {removeSelectedPublishItems} from './publishRemoval';

const row=(n:number)=>({number:n,title:`TITLE ${n}`,description:`DESC ${n}`,tags:[`tag${n}`],source:'test'});
describe('publisher ready-video removal repair',()=>{
 it('removes one selected VIDEO and its mapped DOCX row',()=>{const x=removeSelectedPublishItems(['a','b','c'],['a','b','c'],[row(1),row(2),row(3)],['b']);expect(x.selectedIds).toEqual(['a','c']);expect(x.rows.map(r=>r.number)).toEqual([1,3])});
 it('removes a bulk selection without shifting surviving metadata',()=>{const x=removeSelectedPublishItems(['a','b','c','d'],['a','b','c','d'],[row(1),row(2),row(3),row(4)],['a','d']);expect(x.selectedIds).toEqual(['b','c']);expect(x.rows.map(r=>r.number)).toEqual([2,3])});
 it('does not touch DOCX rows when an unselected VIDEO is removed',()=>{const x=removeSelectedPublishItems(['a','b'],['a','b'],[row(1),row(2)],['z']);expect(x.selectedIds).toEqual(['a','b']);expect(x.rows.map(r=>r.number)).toEqual([1,2])});
 it('handles incomplete metadata without inventing rows',()=>{const x=removeSelectedPublishItems(['a','b','c'],['a','b','c'],[row(1),row(2)],['c']);expect(x.selectedIds).toEqual(['a','b']);expect(x.rows.map(r=>r.number)).toEqual([1,2])});
 it('handles stale ids idempotently',()=>{const x=removeSelectedPublishItems(['a'],['a'],[row(1)],['missing','missing']);expect(x.selectedIds).toEqual(['a']);expect(x.rows).toHaveLength(1)});
 it('keeps the correct 37 survivors from a 40-video batch',()=>{const ids=Array.from({length:40},(_,i)=>`v${i+1}`),rows=ids.map((_,i)=>row(i+1));const x=removeSelectedPublishItems(ids,ids,rows,['v4','v17','v40']);expect(x.selectedIds).toHaveLength(37);expect(x.selectedIds).not.toContain('v4');expect(x.selectedIds).not.toContain('v17');expect(x.selectedIds).not.toContain('v40');expect(x.rows.map(r=>r.number)).not.toContain(4);expect(x.rows.map(r=>r.number)).not.toContain(17);expect(x.rows.map(r=>r.number)).not.toContain(40)});
});
