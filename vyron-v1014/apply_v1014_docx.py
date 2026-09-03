#!/usr/bin/env python3
from pathlib import Path
import re

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.14 DOCX: '+msg)

# Validation semantics: DOCX may contain MORE metadata records than selected videos.
# It must never contain FEWER records than the actual selected target set.
p=Path('src/metadata.ts');s=p.read_text()
old="""export function validateSequentialMetadata(rows:ImportedMetadata[],expected:number){
  const numbers=rows.map(x=>x.number).filter((x):x is number=>Number.isFinite(x));
  const missing=Array.from({length:expected},(_,i)=>i+1).filter(n=>!numbers.includes(n));
  const duplicates=[...new Set(numbers.filter((n,i)=>numbers.indexOf(n)!==i))];
  return {ok:rows.length===expected&&numbers.length===expected&&!missing.length&&!duplicates.length,rows:rows.length,expected,missing,duplicates}
}"""
new="""export function validateSequentialMetadata(rows:ImportedMetadata[],expected:number){
  const need=Math.max(0,Math.floor(expected||0));
  const numbers=rows.map(x=>x.number).filter((x):x is number=>Number.isFinite(x));
  const missing=Array.from({length:need},(_,i)=>i+1).filter(n=>!numbers.includes(n));
  const relevant=numbers.filter(n=>n>=1&&n<=need);
  const duplicates=[...new Set(relevant.filter((n,i)=>relevant.indexOf(n)!==i))];
  return {ok:rows.length>=need&&relevant.length>=need&&!missing.length&&!duplicates.length,rows:rows.length,expected:need,missing,duplicates,surplus:Math.max(0,rows.length-need)}
}"""
must(old in s,'validateSequentialMetadata exact-count implementation missing');s=s.replace(old,new,1);p.write_text(s)

p=Path('src/MetadataPage.tsx');s=p.read_text()
# Import: accept 30-row DOCX when only 19 videos are currently selected; reject 1-row DOCX for 19 videos.
old="""if(strict&&target==='youtube'){const count=yt.filter(v=>v.selected).length;if(count>0){const check=validateSequentialMetadata(out,count);if(!check.ok){toast(`DOCX не применён: в файле ${out.length}, выбрано ${count}${check.missing.length?` • нет VIDEO ${check.missing.join(', ')}`:''}${check.duplicates.length?` • дубли ${check.duplicates.join(', ')}`:''}`);return}}}setRows(out);setDocxStrict(strict);toast(strict?`SEO DOCX: распознано ${out.length}. Выбери ровно ${out.length} видео.`:`Метаданные: распознано ${out.length}`)"""
new="""if(strict&&target==='youtube'){const count=yt.filter(v=>v.selected).length;if(count>0){const check=validateSequentialMetadata(out,count);if(!check.ok){notifyWarning('DOCX не подходит к выбранным видео',out.length<count?`В Word ${out.length} записей, а выбрано ${count} видео. Нужно минимум ${count} записей.`:`Проверь нумерацию VIDEO 001–${String(count).padStart(3,'0')}${check.missing.length?`. Нет: ${check.missing.join(', ')}`:''}${check.duplicates.length?`. Дубли: ${check.duplicates.join(', ')}`:''}`);return}}}setRows(out);setDocxStrict(strict);if(strict){const count=yt.filter(v=>v.selected).length;notifySuccess('Word-файл принят',count?`${out.length} записей в DOCX • выбрано ${count} видео.${out.length>count?` Лишние ${out.length-count} записей пока не применяются.`:''}`:`Распознано ${out.length} записей. Теперь выберите до ${out.length} видео.`,{operationId:`docx-loaded:${channelId}:${out.length}:${Date.now()}`})}else toast(`Метаданные: распознано ${out.length}`)"""
must(old in s,'Metadata readFiles strict exact-count block missing');s=s.replace(old,new,1)

# Apply guard: only shortage is blocking. Surplus rows remain safely unused.
old="if(!profileId||!selectedYt.length)return;if(docxStrict&&rows.length!==selectedYt.length){toast('DOCX не применён: количество выбранных видео изменилось после импорта');return}"
new="if(!profileId||!selectedYt.length)return;if(docxStrict&&rows.length<selectedYt.length){notifyWarning('Недостаточно записей в Word',`В DOCX ${rows.length} записей, а выбрано ${selectedYt.length} видео. Уменьшите выбор видео или загрузите DOCX минимум на ${selectedYt.length} записей.`);return}"
must(old in s,'applyYoutube exact DOCX guard missing');s=s.replace(old,new,1)

old="if(target==='youtube'&&rows.length!==selectedYt.length){toast(`Нужно точное 1:1: записей ${rows.length}, выбрано ${selectedYt.length}`);return}"
new="if(target==='youtube'&&rows.length<selectedYt.length){notifyWarning('Недостаточно метаданных',`Записей: ${rows.length}. Выбрано видео: ${selectedYt.length}. Метаданных должно быть не меньше количества выбранных видео.`);return}"
must(old in s,'apply exact 1:1 guard missing');s=s.replace(old,new,1)

# Apply button must not be disabled merely because DOCX contains extra planned records.
old="target==='youtube'&&rows.length!==selectedYt.length"
new="target==='youtube'&&rows.length<selectedYt.length"
must(old in s,'header exact-count disable expression missing');s=s.replace(old,new,1)

# User-facing strict card/text: plan count is not a requirement.
s=s.replace('Выбери ровно {rows.length} видео.','Можно выбрать до {rows.length} видео. План Production на количество не влияет.')
s=s.replace('DOCX должен совпадать 1:1 с выбранными видео.','В DOCX должно быть не меньше записей, чем реально выбранных видео. Лишние записи разрешены и не применяются.')
p.write_text(s)

# Dedicated acceptance tests for the user's rule.
Path('src/metadataCoverage.test.ts').write_text(r'''import {describe,expect,it} from 'vitest';
import {validateSequentialMetadata,type ImportedMetadata} from './metadata';
const rows=(n:number):ImportedMetadata[]=>Array.from({length:n},(_,i)=>({number:i+1,title:`Title ${i+1}`,source:'test.docx'}));
describe('DOCX capacity follows actual selected videos, not Production plan',()=>{
 it('accepts 30 metadata rows when only 19 real videos are selected',()=>{const r=validateSequentialMetadata(rows(30),19);expect(r.ok).toBe(true);expect(r.surplus).toBe(11)});
 it('accepts exact actual video count regardless of a larger Production plan',()=>expect(validateSequentialMetadata(rows(19),19).ok).toBe(true));
 it('rejects one metadata row when more than one video is selected',()=>expect(validateSequentialMetadata(rows(1),19).ok).toBe(false));
 it('rejects missing VIDEO number inside the selected coverage',()=>{const x=rows(30).filter(r=>r.number!==7);expect(validateSequentialMetadata(x,19).ok).toBe(false)});
});
''')

print('VYRON 1.0.14 DOCX actual-video coverage rule applied')
