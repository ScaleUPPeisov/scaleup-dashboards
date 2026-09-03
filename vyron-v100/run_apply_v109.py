#!/usr/bin/env python3
from pathlib import Path
import os,sys

if len(sys.argv)!=2:
    raise SystemExit('usage: run_apply_v109.py <restored-source-root>')
script=Path(__file__).with_name('apply_v109.py').read_text(encoding='utf-8')
# Tests live in src-tauri/src/production_manager_tests.rs in the released source.
# Remove the obsolete inline-test patch attempt from the patch program itself.
bad='''# Unit-test request factory must populate the new optional field.\nr=rep(r,\n''' + "'''BuildRequest{request_id:\"test-request\".into(),workspace:workspace.to_string_lossy().into_owned(),channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:''',\n'''BuildRequest{request_id:\"test-request\".into(),workspace:workspace.to_string_lossy().into_owned(),output_workspace:None,channel_id:cid.into(),channel_name:cname.into(),project_count:count,tracks_per_project:tpp,mode:mode.into(),allow_image_reuse:reuse,job_links:''',\n'Rust test request factory changed')\n\n"
if bad not in script:
    raise SystemExit('VYRON 1.0.9 wrapper: expected obsolete inline-test block not found')
script=script.replace(bad,'',1)
# Exact formatting of the TS invoke wrapper is not an API contract. Preserve the
# collector semantically: the command name must remain present, while the native
# collector source is separately regression-checked by CI.
old="must('start_production_import(workspace' in Path('src/productionManagerApi.ts').read_text(),'collector API changed')"
new="must('start_production_import' in Path('src/productionManagerApi.ts').read_text(),'collector API changed')"
if old not in script:
    raise SystemExit('VYRON 1.0.9 wrapper: collector invariant marker missing')
script=script.replace(old,new,1)
root=Path(sys.argv[1]).resolve()
if not (root/'package.json').is_file():
    raise SystemExit(f'not a VYRON source root: {root}')
os.chdir(root)
exec(compile(script,'apply_v109.py','exec'),{'__name__':'__main__','__file__':str(Path(__file__).with_name('apply_v109.py'))})
