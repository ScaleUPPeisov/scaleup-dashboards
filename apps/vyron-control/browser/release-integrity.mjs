// Reproducible release evidence: public source SHA and file integrity, never secrets.
// All paths below are static, and no private API responses or credentials are recorded.
import {createHash} from 'node:crypto';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join,dirname} from 'node:path';

export const RELEASE_ASSETS=Object.freeze([
 '/app.js','/neo-glass.mjs','/neo-glass.css','/styles.css',
 '/service-worker.js','/manifest.webmanifest','/'
]);
const HERE=dirname(fileURLToPath(import.meta.url));
const ROOT=join(HERE,'..');
const sha256=data=>createHash('sha256').update(data).digest('hex');
export async function buildIntegrityManifest(commitSha,reader=readFile){
 if(!/^[0-9a-f]{40}$/.test(commitSha))throw new Error('Invalid exact release commit SHA');
 const assets={};
 for(const path of RELEASE_ASSETS)assets[path]=sha256(await reader(join(ROOT,'public',path==='/'?'index.html':path.slice(1))));
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
// Cloudflare Worker and Assets propagate independently across edge locations.
export async function verifyProductionEventually({expectedSha,origin,fetchImpl=fetch,
  maxAttempts=18,delayMs=3000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
  if(!/^[0-9a-f]{40}$/.test(expectedSha))throw new Error('Invalid expected Git SHA');
  if(!/^https:\/\/[A-Za-z0-9.-]+$/.test(origin||''))throw new Error('Invalid origin');
  let last='manifest_unavailable';
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{
      const url=origin+'/build-info.json?release_verify='+expectedSha.slice(0,12);
      const response=await fetchImpl(url,{cache:'no-store',redirect:'error',
        headers:{'Cache-Control':'no-cache'}});
      if(!response.ok)throw new Error('manifest_http_'+response.status);
      const manifest=await response.json();
      return await verifyPublicIntegrity({manifest,expectedSha,fetchImpl,origin});
    }catch(e){
      last=String(e?.message||'integrity_error').slice(0,140);
      if(attempt<maxAttempts){
        console.log('Awaiting propagation of Worker and static assets ('+
          attempt+'/'+maxAttempts+', reason='+last+').');
        await sleep(delayMs);
      }
    }
  }
  throw new Error('Production release integrity failed after '+maxAttempts+
    ' bounded attempts: '+last);
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
   const result=await verifyProductionEventually({expectedSha:sha,origin});
   console.log('PASS Production integrity: SHA '+result.sha+' and '+result.assets+' assets verified.');
 }else throw new Error('Expected build or verify operation');
}
