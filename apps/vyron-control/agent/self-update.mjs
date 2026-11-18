// Pull-only, allowlisted Mac Bridge updater. Never changes VYRON.app or ENDLUME.app.
// Runs solely inside ~/.vyron-control-agent/source after GitHub CI verifies release HEAD.
import {execFileSync} from 'node:child_process';
import {homedir} from 'node:os';
import {dirname,join,resolve} from 'node:path';
const REPO='https://github.com/ScaleUPPeisov/scaleup-dashboards.git';
const BRANCH='release/vyron-control-production';
const ROOT=join(homedir(),'.vyron-control-agent','source');
const CHECKS=new Set(['VYRON CONTROL isolated tests','VYRON Privacy Gate','VYRON CONTROL Security Gate']);
const SHA=/^[0-9a-f]{40}$/;
const ALLOWED=/^(apps\/vyron-control\/|\.github\/workflows\/vyron-control[-\w]*\.ya?ml$)/;

export function safeAgentDiff(paths){
 return Array.isArray(paths)&&paths.every(path=>
   typeof path==='string'&&ALLOWED.test(path)&&
   !path.includes('..')&&!path.startsWith('/'));
}
export function verifiedReleaseChecks(data,sha){
 // Workflow names are stored on workflow_runs, not on check_runs (check jobs are
 // called "verify" or "No user/channel/OAuth data in GitHub").
 if(!SHA.test(sha)||!Array.isArray(data?.workflow_runs))return false;
 const checks=data.workflow_runs.filter(x=>x.head_sha===sha&&
   x.head_branch===BRANCH&&x.event==='push'&&
   x.status==='completed'&&x.conclusion==='success').map(x=>x.name);
 return [...CHECKS].every(name=>checks.includes(name));
}
export function verifiedSignedReleaseCommit(data,sha){
 return SHA.test(sha)&&data?.sha===sha&&
   data?.commit?.verification?.verified===true&&
   data.commit.verification.reason==='valid';
}
export async function maybeUpdateAgent({
 sourceDir=ROOT,git=execFileSync,fetchImpl=fetch
}={}){
 if(resolve(sourceDir)!==resolve(ROOT))return {updated:false,reason:'unsafe_source_path'};
 const cmd=(program,args,options={})=>String(git(program,args,{
   cwd:ROOT,encoding:'utf8',timeout:90000,stdio:['ignore','pipe','pipe'],
   env:{...process.env,GIT_TERMINAL_PROMPT:'0',GIT_SSH_COMMAND:'/usr/bin/false'},...options
 })).trim();
 try{
   const origin=cmd('git',['remote','get-url','origin']);
   if(origin!==REPO)return {updated:false,reason:'unexpected_remote'};
   const changes=cmd('git',['status','--porcelain']);
   if(changes)return {updated:false,reason:'uncommitted_source_changes'};
   const old=cmd('git',['rev-parse','HEAD']);
   // Full release history is required: the installed agent may be >170 commits behind.
   // A shallow fetch can hide a legitimate ancestor and permanently block updates.
   cmd('git',['fetch','--no-tags','origin','refs/heads/'+BRANCH]);
   const next=cmd('git',['rev-parse','FETCH_HEAD']);
   if(!SHA.test(next))return {updated:false,reason:'invalid_commit_sha'};
   if(old===next)return {updated:false,reason:'up_to_date'};
   try{cmd('git',['merge-base','--is-ancestor',old,next]);}
   catch{return {updated:false,reason:'non_fast_forward_release'};}
   const names=cmd('git',['diff','--name-only',old,next]).split('\n').filter(Boolean);
   if(!safeAgentDiff(names))return {updated:false,reason:'unreviewed_desktop_changes'};
   const base='https://api.github.com/repos/ScaleUPPeisov/scaleup-dashboards/';
   const options={headers:{Accept:'application/vnd.github+json',
     'User-Agent':'vyron-control-agent-release-check'},signal:AbortSignal.timeout(12000)};
   const [signedResponse,verifiedResponse]=await Promise.all([
     fetchImpl(base+'commits/'+next,options),
     fetchImpl(base+'actions/runs?branch=release%2Fvyron-control-production&per_page=100',options)
   ]);
   if(!signedResponse.ok||!verifiedSignedReleaseCommit(await signedResponse.json(),next))
     return {updated:false,reason:'release_signature_missing'};
   if(!verifiedResponse.ok||!verifiedReleaseChecks(await verifiedResponse.json(),next))
     return {updated:false,reason:'release_ci_unverified'};
   // All commands below affect ONLY the private Mac Bridge Git clone, never VYRON or ENDLUME.
   try{
     cmd('git',['reset','--hard',next]);
     cmd(join(dirname(process.execPath),'npm'),['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],
       {cwd:join(ROOT,'apps','vyron-control'),timeout:120000});
     cmd(process.execPath,['--test','agent/bridge.test.mjs','agent/retry.test.mjs'],
       {cwd:join(ROOT,'apps','vyron-control'),timeout:120000});
     return {updated:true,sha:next};
   }catch{
     cmd('git',['reset','--hard',old]);
     try{cmd(join(dirname(process.execPath),'npm'),['ci','--omit=dev','--ignore-scripts','--no-audit','--no-fund'],
       {cwd:join(ROOT,'apps','vyron-control'),timeout:120000});}catch{}
     return {updated:false,reason:'candidate_failed_rolled_back'};
   }
 }catch{return {updated:false,reason:'release_check_unavailable'};}
}
