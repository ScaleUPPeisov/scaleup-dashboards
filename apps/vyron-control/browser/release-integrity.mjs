// Reproducible release evidence: public source SHA and file integrity, never secrets.
// All paths below are static, and no private API responses or credentials are recorded.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

export const RELEASE_ASSETS=Object.freeze([
 '/app.js','/neo-glass.mjs','/neo-glass.css','/styles.css',
 '/service-worker.js','/manifest.webmanifest','/index.html'
]);
const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=join(HERE,'..');
const sha256=data=>createHash('sha256').update(data).digest('hex');
export async function buildIntegrityManifest(commitSha,reader=readFile){
 if(!/^[0-9a-f]{40}$/.test(commitSha))throw new Error('Invalid exact release commit SHA');
 const assets={};
 for(const path of RELEASE_ASSETS)assets[path]=sha256(await reader(join(ROOT,'public',path.slice(1))));
 return {app:'VYRON PEISOV YT',gitSha:commitSha,algorithm:'sha256',
   assets,generatedAt:new Date().toISOString()};
}
export async function verifyPublicIntegrity({manifest,expectedSha,fetchImpl=fetch,origin}){
 if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(origin||''))throw Error('Invalid HTTPS origin');
 if(manifest?.gitSha!==expectedSha||manifest?.algorithm!=='sha256')
   throw new Error('Release Git SHA mismatch');
 if(Object.keys(manifest.assets||{}).sort().join(',')!==RELEASE_ASSETS.slice().sort().join(','))
   throw new Error('Missing or unknown release asset');
 for(const path of RELEASE_ASSETS){
   const response=await fetchImpl(origin+path,{cache:'no-store',redirect:'error'});
   if(!response.ok)throw new Error('Release asset unavailable: '+path);
   const digest=sha256(Buffer.from(await response.arrayBuffer()));
   if(digest!==manifest.assets[path])throw new Error('Release asset SHA256 mismatch: '+path);
 }
 return {ok:true,sha:expectedSha,assets:RELEASE_ASSETS.length};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const action=process.argv[2];
 const sha=process.env.RELEASE_SHA||'';
 if(action==='build'){
   const manifest=await buildIntegrityManifest(sha);
   await writeFile(join(ROOT,'public','build-info.json'),JSON.stringify(manifest,null,2)+'\n');
   console.log('Release integrity manifest created for SHA '+sha+' with '+RELEASE_ASSETS.length+' asset hashes.');
 }else if(action==='verify'){
   const origin=process.env.VYRON_CONTROL_URL?.replace(/\/$/,'');
   if(origin!=='https://vyron-control.endlume-peisov-3ee6109f.workers.dev')
     throw Error('Release verification only targets the configured Production Worker');
   const response=await fetch(origin+'/build-info.json',{cache:'no-store',redirect:'error'});
   if(!response.ok)throw new Error('Production build manifest unavailable');
   const result=await verifyPublicIntegrity({manifest:await response.json(),
     expectedSha:sha,origin});
   console.log('PASS Production integrity: SHA '+result.sha+' and '+result.assets+' assets verified.');
 }else throw new Error('Expected build or verify operation');
}
