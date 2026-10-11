from pathlib import Path
p=Path('src-tauri/src/youtube.rs')
s=p.read_text(encoding='utf-8')
def r(old,new,label):
 c=s.count(old)
 if c!=1: raise SystemExit(f'PATCH_GUARD_FAIL:{label}:{c}')
 return s.replace(old,new,1)
old="""pub async fn youtube_update_existing_video(
    app: AppHandle,
    profile_id: String,
    video_id: String,
    title: String,
    description: String,
    tags: Vec<String>,"""
new="""pub async fn youtube_update_existing_video(
    app: AppHandle,
    profile_id: String,
    video_id: String,
    title: Option<String>,
    description: Option<String>,
    tags: Option<Vec<String>>,"""
s=r(old,new,'signature')
old="""let wanted_title = youtube_clean_title(&title);
    if wanted_title.is_empty() {
        return Err(\"YouTube title не может быть пустым\".into());
    }
    let wanted_desc = youtube_truncate_utf8_bytes(&description.replace(['<', '>'], \" \"), 5000);
    let wanted_tags_vec = youtube_sanitize_tags(tags);"""
new="""let title_requested = title.is_some();
    let description_requested = description.is_some();
    let tags_requested = tags.is_some();
    let category_requested = category_id.is_some();
    let old_title = sn.get(\"title\").and_then(|x| x.as_str()).unwrap_or(\"\");
    let wanted_title = title.as_deref().map(youtube_clean_title).unwrap_or_else(|| old_title.to_string());
    if title_requested && wanted_title.is_empty() {
        return Err(\"YouTube title не может быть пустым\".into());
    }
    let old_desc = sn.get(\"description\").and_then(|x| x.as_str()).unwrap_or(\"\");
    let wanted_desc = description.as_deref().map(|x| youtube_truncate_utf8_bytes(&x.replace(['<', '>'], \" \"), 5000)).unwrap_or_else(|| old_desc.to_string());
    let old_tags_vec = sn.get(\"tags\").and_then(|x| x.as_array()).map(|a| a.iter().filter_map(|x| x.as_str().map(str::to_string)).collect::<Vec<_>>()).unwrap_or_default();
    let wanted_tags_vec = tags.as_ref().map(|x| youtube_sanitize_tags(x.clone())).unwrap_or(old_tags_vec);"""
s=r(old,new,'preserve-snippet')
p.write_text(s,encoding='utf-8')
print('NATIVE_PATCH_1=PASS')
