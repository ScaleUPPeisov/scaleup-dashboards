from pathlib import Path
p=Path('src-tauri/src/youtube.rs')
s=p.read_text(encoding='utf-8')
def r(old,new,label):
 c=s.count(old)
 if c!=1: raise SystemExit(f'PATCH_GUARD_FAIL:{label}:{c}')
 return s.replace(old,new,1)
old="""let metadata_needed = !youtube_metadata_diff(
        &sn,
        &wanted_title,
        &wanted_desc,
        &wanted_tags_vec,
        &wanted_category,
    )
    .is_empty();"""
new="""let metadata_requested = title_requested || description_requested || tags_requested || category_requested;
    let metadata_needed = metadata_requested && !youtube_metadata_diff(
        &sn,
        &wanted_title,
        &wanted_desc,
        &wanted_tags_vec,
        &wanted_category,
    )
    .is_empty();"""
s=r(old,new,'metadata-gate')
old="""let target_privacy = privacy_status
        .as_deref()"""
new="""let privacy_requested = privacy_status.as_deref().filter(|x| matches!(*x, \"private\" | \"public\" | \"unlisted\")).is_some();
    let target_privacy = privacy_status
        .as_deref()"""
s=r(old,new,'privacy-flag')
old="""let publish = publish_at
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty());
    let old_publish = old_status.get(\"publishAt\").and_then(|x| x.as_str());
    let publish_changed = !same_publish_time(publish, old_publish);
    let schedule_requested = publish_changed || target_privacy != old_privacy;"""
new="""let publish_requested = publish_at.as_deref().map(str::trim).filter(|x| !x.is_empty()).is_some();
    let publish = publish_at
        .as_deref()
        .map(str::trim)
        .filter(|x| !x.is_empty());
    let old_publish = old_status.get(\"publishAt\").and_then(|x| x.as_str());
    let publish_changed = publish_requested && !same_publish_time(publish, old_publish);
    let privacy_changed = privacy_requested && target_privacy != old_privacy;
    let schedule_requested = publish_changed || privacy_changed;"""
s=r(old,new,'schedule-gate')
p.write_text(s,encoding='utf-8')
print('NATIVE_PATCH_2=PASS')
