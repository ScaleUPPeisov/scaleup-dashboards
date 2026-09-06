#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src-tauri/src/storage.rs';s=p.read_text()
old='''        }else if path.exists(){let _=security::private_permissions(&path);}
        hydrate_state_secrets(disk)'''
new='''        }else if path.exists(){let _=security::private_permissions(&path);}
        // Any legacy state.bak may still contain old plaintext API keys. Once
        // Keychain persistence succeeded, replace it with the sanitized snapshot.
        let bak=path.with_extension("bak");
        if bak.exists(){if let Ok(bytes)=serde_json::to_vec_pretty(&disk){let _=fs::write(&bak,bytes);let _=security::private_permissions(&bak);}}
        hydrate_state_secrets(disk)'''
if old not in s: raise SystemExit('v209 backup scrub anchor missing')
p.write_text(s.replace(old,new,1))
print('VYRON 2.0.9 legacy state backup scrub applied')
