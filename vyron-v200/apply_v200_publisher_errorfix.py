#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/PublisherOS.tsx';s=p.read_text()
anchor="import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';"
if anchor not in s:raise SystemExit('Publisher notification import missing')
s=s.replace(anchor,anchor+"\nimport {humanizeError} from './errorCenter';",1)
s=s.replace("catch(e){thumbError=String(e);notifyWarning('Видео продолжено, обложка не применена',`VIDEO_${String(j.number).padStart(3,'0')}: ${thumbError}`)}", "catch(e){const h=humanizeError(e,'thumbnail');thumbError=h.message;notifyWarning(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`)}")
s=s.replace("catch(e){patchJob(j.id,{status:'ERROR',error:String(e),uploadInterruptedAt:new Date().toISOString()});notifyError('Не удалось продолжить загрузку',String(e))}", "catch(e){const h=humanizeError(e,'upload');patchJob(j.id,{status:'ERROR',error:h.message,uploadInterruptedAt:new Date().toISOString()});notifyError(h.title,h.message)}")
s=s.replace("catch(e){thumbError=String(e);notifyWarning('Видео загружено, но обложка не применена',`VIDEO_${String(j.number).padStart(3,'0')}: ${thumbError}`)}", "catch(e){const h=humanizeError(e,'thumbnail');thumbError=h.message;notifyWarning(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`)}")
s=s.replace("updateChannel(channelId,{knownUploadLimitState:'limited',lastDailyLimitError:String(e),lastUploadAt:new Date().toISOString()});", "{const h=humanizeError(e,'upload');updateChannel(channelId,{knownUploadLimitState:'limited',lastDailyLimitError:h.message,lastUploadAt:new Date().toISOString()});}")
s=s.replace("patchJob(j.id,{status:'ERROR',error:String(e)});notifyWarning('YouTube quota остановила batch','Оставшаяся партия сохранена.');", "{const h=humanizeError(e,'youtube');patchJob(j.id,{status:'ERROR',error:h.message});notifyWarning(h.title,'Оставшаяся партия сохранена.');}")
s=s.replace("patchJob(j.id,{status:'ERROR',error:String(e)});notifyError(`VIDEO_${String(j.number).padStart(3,'0')} не загружено`,String(e))", "{const h=humanizeError(e,'upload');patchJob(j.id,{status:'ERROR',error:h.message});notifyError(h.title,`VIDEO_${String(j.number).padStart(3,'0')}: ${h.message}`)}")
p.write_text(s)
print('VYRON 2.0 Publisher human-error routing applied')
