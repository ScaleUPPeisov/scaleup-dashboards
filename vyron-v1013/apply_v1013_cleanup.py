#!/usr/bin/env python3
from pathlib import Path

def must(cond,msg):
    if not cond: raise SystemExit('VYRON 1.0.13 cleanup: '+msg)

# macOS default filesystems are case-insensitive. Keep the notification bus as
# notificationCenter.ts and give the React renderer a genuinely distinct name.
old_component=Path('src/NotificationCenter.tsx')
new_component=Path('src/NotificationStack.tsx')
must(old_component.exists(),'NotificationCenter.tsx generated component missing')
if new_component.exists(): new_component.unlink()
old_component.rename(new_component)

p=Path('src/App.tsx');s=p.read_text();s=s.replace("import {NotificationCenter} from './NotificationCenter';","import {NotificationCenter} from './NotificationStack';",1);s=s.replace("page=useApp(s=>s.page),setPage=useApp(s=>s.setPage),notice=useApp(s=>s.notice),log=useApp(s=>s.log)","page=useApp(s=>s.page),setPage=useApp(s=>s.setPage),log=useApp(s=>s.log)",1);p.write_text(s)
p=Path('src/ProductionManager.tsx');s=p.read_text();s=s.replace("import {notifyError,notifyInfo,notifySuccess,notifyWarning} from './notificationCenter';","import {notifyInfo,notifySuccess} from './notificationCenter';",1);p.write_text(s)
p=Path('src/channelSchedule.ts');s=p.read_text();s=s.replace("const lastScheduledAt=scheduled.at(-1),lastPublishedAt=published.at(-1);","const lastScheduledAt=scheduled.length?scheduled[scheduled.length-1]:undefined,lastPublishedAt=published.length?published[published.length-1]:undefined;",1);p.write_text(s)
p=Path('src/MetadataPage.tsx');s=p.read_text();s=s.replace("const previewFirst=schedulePreview[0]?.publishAt,previewLast=schedulePreview.at(-1)?.publishAt;","const previewFirst=schedulePreview[0]?.publishAt,previewLast=schedulePreview.length?schedulePreview[schedulePreview.length-1]?.publishAt:undefined;",1);p.write_text(s)
p=Path('src/channelSchedule.test.ts');s=p.read_text();s=s.replace("expect(plan.at(-1)?.publishAt)","expect(plan[plan.length-1]?.publishAt)",1);p.write_text(s)
print('VYRON 1.0.13 compile-safety cleanup applied')
