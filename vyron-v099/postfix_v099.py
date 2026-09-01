from pathlib import Path
p=Path('.vyron-v051/src/QuotaMeter.tsx')
s=p.read_text()
old='saveYoutubeQuotaPlan({channels,videos});'
new='saveYoutubeQuotaPlan({channels,videosPerChannel:videos});'
if old not in s:
    raise SystemExit('VYRON 0.9.9 postfix target not found')
p.write_text(s.replace(old,new,1))
print('VYRON 0.9.9 quota planner TypeScript postfix applied')
