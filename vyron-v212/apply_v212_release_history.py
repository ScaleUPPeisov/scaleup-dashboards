#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src/VyronReleaseHistory.tsx';s=p.read_text();anchor="export const VYRON_RELEASES:VyronRelease[]=[\n"
if anchor not in s:raise SystemExit('release history anchor missing')
entry=""" {version:'2.0.12',date:'07.09.2026',title:'Image Folder Import • persistent channel image pool',items:[
  'В «Производство → Материалы → Изображения» добавлена вторая кнопка «ИМПОРТ ИЗ ПАПКИ» рядом с существующим сбором из Downloads.',
  'Можно выбрать любую папку на Mac; VYRON рекурсивно импортирует jpg/jpeg/png/webp в материалы текущего канала.',
  'Импорт не требует заранее созданных VIDEO-проектов: изображения накапливаются в persistent image pool канала и используются позже при сборке проектов.',
  'Можно последовательно импортировать несколько разных папок для одного канала; нумерация продолжается, уже импортированный source path повторно не добавляется.',
  'Исходные папки и файлы не изменяются: VYRON создаёт свои копии внутри существующего Production Manager storage.',
  'Downloads Collector сохранён отдельным способом сбора; повторный запуск Downloads теперь продолжает существующий image pool вместо потери ранее импортированных материалов.',
  'В истории сборок добавлена кнопка «УДАЛИТЬ ВСЕ ПРОЕКТЫ»: после подтверждения она удаляет все VIDEO-проекты текущего канала через штатный безопасный batch-delete; изображения, музыкальная библиотека и настройки канала сохраняются.',
  'Shorts Factory 2.0.11, ENDLUME Bridge, OAuth, Publisher и обычный VIDEO pipeline не менялись.'
 ]},
"""
if "version:'2.0.12'" not in s:s=s.replace(anchor,anchor+entry,1)
p.write_text(s)
t=root/'src/VyronReleaseHistory.test.ts';x=t.read_text();x=x.replace("expect(versions[0]).toBe('2.0.11')","expect(versions[0]).toBe('2.0.12')");x=x.replace("for(const v of ['2.0.10'","for(const v of ['2.0.11','2.0.10'");t.write_text(x)
print('VYRON 2.0.12 release history entry: PASS')
