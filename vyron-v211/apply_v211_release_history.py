#!/usr/bin/env python3
from pathlib import Path
import sys
root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src/VyronReleaseHistory.tsx';s=p.read_text()
anchor="export const VYRON_RELEASES:VyronRelease[]=[\n"
if anchor not in s: raise SystemExit('release history anchor missing')
entry=""" {version:'2.0.11',date:'07.09.2026',title:'Shorts Factory • batch render • metadata • scheduling',items:[
  'В «Производство» добавлен отдельный SHORTS workflow для готовых горизонтальных MP4 из Long VIDEO.',
  'Shorts Factory создаёт вертикальный 1080×1920 ролик: исходный 16:9 кадр поверх размытого фона, со звуком исходника и без субтитров.',
  'Добавлены batch-пресеты до 500 Shorts, непересекающиеся диапазоны, защита от повторного использования фрагментов и восстановление очереди после перезапуска.',
  'FFmpeg/FFprobe pipeline проверяет source/output, использует временный part-файл, аппаратный VideoToolbox first и libx264 fallback.',
  'YouTube Metadata получил отдельный режим SHORTS с независимыми пресетами, проверкой title/description/tags и защитой от duplicate title.',
  'Расписание Shorts работает локально в Asia/Krasnoyarsk; доступны 1/2/3/5 публикаций в день и пользовательское число уникальных времён.',
  'YouTube upload использует существующий resumable pipeline, не делает второй videos.insert при сохранённой session и блокирует повторную загрузку уже загруженного Short.',
  'Quota Meter разделяет Long Videos, Shorts и общий Total Video Uploads; существующие Production, ENDLUME, Future Channels и Security Layer сохранены.'
 ]},
"""
if "version:'2.0.11'" not in s:s=s.replace(anchor,anchor+entry,1)
p.write_text(s)
t=root/'src/VyronReleaseHistory.test.ts';x=t.read_text();x=x.replace("expect(versions[0]).toBe('2.0.10')", "expect(versions[0]).toBe('2.0.11')");x=x.replace("for(const v of ['2.0.9'", "for(const v of ['2.0.10','2.0.9'");t.write_text(x)
print('VYRON 2.0.11 release history entry: PASS')
