from pathlib import Path
p=Path('.vyron-v051/src-tauri/src/youtube.rs')
s=p.read_text()
old='}}Err("Thumbnail недоступна после fallback".into())}'
new='}}}Err("Thumbnail недоступна после fallback".into())}'
if old not in s:
    raise SystemExit('thumbnail closing-brace marker not found')
s=s.replace(old,new,1)
p.write_text(s)
print('VYRON 0.8 Rust thumbnail delimiter fixed')
