#!/usr/bin/env python3
from pathlib import Path
import sys

root=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=root/'src/youtubeQuota.ts'
s=p.read_text()
bad="return{...base,...raw,buckets:{general:{...base.buckets.general,...raw.buckets?.general},videoUploads:{...base.buckets.videoUploads,...raw.buckets?.videoUploads},search:{...base.buckets.search,...raw.buckets?.search}}}}catch{}"
good="return{...base,...raw,buckets:{general:{...base.buckets.general,...raw.buckets?.general},videoUploads:{...base.buckets.videoUploads,...raw.buckets?.videoUploads},search:{...base.buckets.search,...raw.buckets?.search}}}}}catch{}"
if bad not in s:
    raise SystemExit('quota readLedger fix anchor not found')
p.write_text(s.replace(bad,good,1))
print('VYRON 1.1.0 quota ledger syntax fixed')
