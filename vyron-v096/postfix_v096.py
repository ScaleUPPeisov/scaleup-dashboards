from pathlib import Path

p=Path('.vyron-v051/src-tauri/src/youtube.rs')
s=p.read_text()
old='''if let Some(p)=publish{match chrono::DateTime::parse_from_rfc3339(p){Ok(dt)=>{if dt.with_timezone(&Utc)<=Utc::now(){return Ok(json!({"id":video_id,"verified":false,"metadataVerified":true,"scheduleRequested":true,"scheduleVerified":false,"scheduleError":"Дата публикации уже в прошлом. Метаданные сохранены, расписание не изменено.","appliedTags":wanted_tags.len()}))}},Err(_)=>return Ok(json!({"id":video_id,"verified":false,"metadataVerified":true,"scheduleRequested":true,"scheduleVerified":false,"scheduleError":"Некорректный publishAt: ожидается RFC3339","appliedTags":wanted_tags.len()}))}}}'''
new='''if let Some(p)=publish{\n  match chrono::DateTime::parse_from_rfc3339(p){\n   Ok(dt)=>{\n    if dt.with_timezone(&Utc)<=Utc::now(){\n     return Ok(json!({"id":video_id,"verified":false,"metadataVerified":true,"scheduleRequested":true,"scheduleVerified":false,"scheduleError":"Дата публикации уже в прошлом. Метаданные сохранены, расписание не изменено.","appliedTags":wanted_tags.len()}))\n    }\n   },\n   Err(_)=>return Ok(json!({"id":video_id,"verified":false,"metadataVerified":true,"scheduleRequested":true,"scheduleVerified":false,"scheduleError":"Некорректный publishAt: ожидается RFC3339","appliedTags":wanted_tags.len()}))\n  }\n }'''
if old not in s:
    raise SystemExit('VYRON 0.9.6 publishAt delimiter marker not found')
s=s.replace(old,new,1)
s=s.replace('sd.push("publishAt")','sd.push("publishAt".to_string())')
s=s.replace('sd.push("privacyStatus")','sd.push("privacyStatus".to_string())')
p.write_text(s)
print('VYRON 0.9.6 Rust postfix applied: publishAt delimiter + verify String types')
