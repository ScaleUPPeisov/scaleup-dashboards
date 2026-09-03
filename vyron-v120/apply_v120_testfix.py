#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/youtubePublishSafety.test.ts'
s=p.read_text()
anchor="import {mapThumbnailsToJobs,metadataCoverage} from './publishCenterCore';\n\n"
insert="""import {mapThumbnailsToJobs,metadataCoverage} from './publishCenterCore';

const storage=new Map<string,string>();
Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{
 getItem:(k:string)=>storage.has(k)?storage.get(k)!:null,
 setItem:(k:string,v:string)=>{storage.set(k,String(v))},
 removeItem:(k:string)=>{storage.delete(k)},
 clear:()=>{storage.clear()},
 key:(i:number)=>Array.from(storage.keys())[i]??null,
 get length(){return storage.size}
}});

"""
if anchor not in s: raise SystemExit('publish safety test anchor missing')
p.write_text(s.replace(anchor,insert,1))
print('VYRON 1.2 publish safety Vitest storage mock applied')
