from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count=text.count(old)
    if count!=1:
        raise SystemExit(f'PATCH_GUARD_FAIL:{label}:expected=1:actual={count}')
    return text.replace(old,new,1)

p=Path('src/ExistingVideos.tsx')
s=p.read_text(encoding='utf-8')
old="api.youtubeUpdateExisting(profileId,v.id,v.title,v.description,v.tags,v.publishAt,v.privacyStatus,v.categoryId,operationId)"
new="api.youtubeUpdateExisting(profileId,v.id,{title:v.title,description:v.description,tags:v.tags,publishAt:v.publishAt,privacyStatus:v.privacyStatus as 'private'|'public'|'unlisted',categoryId:v.categoryId},operationId)"
count=s.count(old)
if count!=2:
    raise SystemExit(f'PATCH_GUARD_FAIL:existing-videos-callers:expected=2:actual={count}')
s=s.replace(old,new)
p.write_text(s,encoding='utf-8')

p=Path('src/vyron6110MetadataScheduleOptIn.test.ts')
s=p.read_text(encoding='utf-8')
s=s.replace("fs.readFileSync(new URL('./MetadataPage.tsx',import.meta.url),'utf8')","fs.readFileSync(new URL('./MetadataPage.tsx',import.meta.url).pathname,'utf8')")
s=s.replace("fs.readFileSync(new URL('./api.ts',import.meta.url),'utf8')","fs.readFileSync(new URL('./api.ts',import.meta.url).pathname,'utf8')")
s=s.replace("fs.readFileSync(new URL('../src-tauri/src/youtube.rs',import.meta.url),'utf8')","fs.readFileSync(new URL('../src-tauri/src/youtube.rs',import.meta.url).pathname,'utf8')")
p.write_text(s,encoding='utf-8')
print('METADATA_COMPAT_PATCH=PASS')
