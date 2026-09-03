#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')

# Vitest runs in Node; provide deterministic localStorage for publish safety tests.
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

# Keep build metadata type-safe even when the base project does not declare vite/client globals.
(ROOT/'src/buildInfo.ts').write_text("""export const VYRON_PRODUCT_NAME='VYRON YT PEISOV';
export const VYRON_PRODUCT_SUBTITLE='YouTube Production OS';
const viteEnv=(import.meta as ImportMeta & {env?:Record<string,string|undefined>}).env;
export const VYRON_BUILD_DATE=(viteEnv?.VITE_BUILD_DATE||'development').trim();
""")

# The 1.1.0 codebase has no standalone YouTubeCalendar/YouTubeDataPage modules.
# Reuse the existing schedule-aware Metadata Hub and real Analytics screen instead of inventing duplicate backends.
cal=ROOT/'src/YouTubeCalendar.tsx'
if not cal.exists():
    cal.write_text("""import React from 'react';
import {MetadataPage} from './MetadataPage';
export function YouTubeCalendar(){return <div className=\"youtubeCalendarBridge\"><MetadataPage/></div>}
""")
data=ROOT/'src/YouTubeDataPage.tsx'
if not data.exists():
    data.write_text("""import React from 'react';
import {AnalyticsPage} from './AnalyticsPage';
export function YouTubeDataPage(){return <div className=\"youtubeDataBridge\"><AnalyticsPage/></div>}
""")

print('VYRON 1.2 frontend compile/test compatibility fixes applied')
