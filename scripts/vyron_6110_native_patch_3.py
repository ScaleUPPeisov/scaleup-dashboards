from pathlib import Path
p=Path('src-tauri/src/youtube.rs')
s=p.read_text(encoding='utf-8')
def r(old,new,label):
 c=s.count(old)
 if c!=1: raise SystemExit(f'PATCH_GUARD_FAIL:{label}:{c}')
 return s.replace(old,new,1)
old="""let time_ok = same_publish_time(publish, gst.get(\"publishAt\").and_then(|x| x.as_str()));
    let privacy_ok =
        gst.get(\"privacyStatus\").and_then(|x| x.as_str()) == Some(target_privacy.as_str());
    let schedule_verified = !schedule_requested || (time_ok && privacy_ok);
    let mut mismatches = metadata_diff;
    if schedule_requested && !time_ok {
        mismatches.push(\"publishAt\".into())
    }
    if schedule_requested && !privacy_ok {
        mismatches.push(\"privacyStatus\".into())
    }"""
new="""let expected_publish = if publish_requested { publish } else { old_publish };
    let expected_privacy = if privacy_requested { target_privacy.as_str() } else { old_privacy };
    let time_ok = same_publish_time(expected_publish, gst.get(\"publishAt\").and_then(|x| x.as_str()));
    let privacy_ok = gst.get(\"privacyStatus\").and_then(|x| x.as_str()) == Some(expected_privacy);
    let schedule_verified = time_ok && privacy_ok;
    let mut mismatches = metadata_diff;
    if !time_ok {
        mismatches.push(\"publishAt\".into())
    }
    if !privacy_ok {
        mismatches.push(\"privacyStatus\".into())
    }"""
s=r(old,new,'preservation-verify')
p.write_text(s,encoding='utf-8')
print('NATIVE_PATCH_3=PASS')
