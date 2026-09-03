#!/usr/bin/env python3
from pathlib import Path
import sys

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else '.')
p = ROOT / 'src-tauri/src/youtube.rs'
s = p.read_text()

helper = r'''fn local_file_fingerprint(path:&Path)->Result<Value,String>{
 let meta=fs::metadata(path).map_err(|e|format!("Файл недоступен: {e}"))?;if !meta.is_file(){return Err("Выбранный путь не является файлом".into())}let size=meta.len();if size==0{return Err("Файл пустой".into())}
 let modified=meta.modified().ok().and_then(|x|x.duration_since(UNIX_EPOCH).ok()).map(|x|x.as_secs()).unwrap_or(0);
 let mut file=fs::File::open(path).map_err(|e|e.to_string())?;let chunk=std::cmp::min(size,1024*1024) as usize;let mut first=vec![0u8;chunk];file.read_exact(&mut first).map_err(|e|e.to_string())?;
 let mut last=Vec::new();if size>chunk as u64{let tail=std::cmp::min(size,1024*1024) as usize;file.seek(std::io::SeekFrom::End(-(tail as i64))).map_err(|e|e.to_string())?;last.resize(tail,0);file.read_exact(&mut last).map_err(|e|e.to_string())?}
 let mut h=Sha256::new();h.update(b"VYRON-YT-PEISOV-FILE-FINGERPRINT-V1");h.update(size.to_le_bytes());h.update(modified.to_le_bytes());h.update(&first);h.update(&last);let fingerprint=format!("{:x}",h.finalize());Ok(json!({"fingerprint":fingerprint,"size":size,"modifiedAt":modified,"path":path.to_string_lossy()}))
}

'''

anchor = '#[tauri::command]\npub fn youtube_file_fingerprint(file_path:String)->Result<Value,String>{local_file_fingerprint(Path::new(&file_path))}'

if 'fn local_file_fingerprint(path:&Path)->Result<Value,String>' in s:
    print('VYRON 2.0 local_file_fingerprint already present')
elif anchor in s:
    p.write_text(s.replace(anchor, helper + anchor, 1))
    print('VYRON 2.0 local_file_fingerprint restored')
else:
    raise SystemExit('youtube_file_fingerprint anchor missing')
