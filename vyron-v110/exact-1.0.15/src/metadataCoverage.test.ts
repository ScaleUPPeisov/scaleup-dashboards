import {describe,expect,it} from 'vitest';
import {validateSequentialMetadata,type ImportedMetadata} from './metadata';
const rows=(n:number):ImportedMetadata[]=>Array.from({length:n},(_,i)=>({number:i+1,title:`Title ${i+1}`,source:'test.docx'}));
describe('DOCX capacity follows actual selected videos, not Production plan',()=>{
 it('accepts 30 metadata rows when only 19 real videos are selected',()=>{const r=validateSequentialMetadata(rows(30),19);expect(r.ok).toBe(true);expect(r.surplus).toBe(11)});
 it('accepts exact actual video count regardless of a larger Production plan',()=>expect(validateSequentialMetadata(rows(19),19).ok).toBe(true));
 it('rejects one metadata row when more than one video is selected',()=>expect(validateSequentialMetadata(rows(1),19).ok).toBe(false));
 it('rejects missing VIDEO number inside the selected coverage',()=>{const x=rows(30).filter(r=>r.number!==7);expect(validateSequentialMetadata(x,19).ok).toBe(false)});
});
