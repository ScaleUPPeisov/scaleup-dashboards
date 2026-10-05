import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';

const read=(name:string)=>readFileSync(decodeURIComponent(new URL('./'+name,import.meta.url).pathname),'utf8');

describe('VYRON 6.1 final YouTube cold route',()=>{
 it('PublisherVideoPicker consumes mutation-time row facts only',()=>{
  const picker=read('PublisherVideoPicker.tsx'),derived=read('publisherDerivedRuntime.ts');
  expect(derived).toContain('latestUploadByJobId');
  expect(derived).toContain('rowFactsById');
  expect(derived).toContain('publisherLatestUploadMap');
  expect(picker).toContain('rowFacts:Map<string,PublisherVideoRowFact>');
  expect(picker).not.toContain('latestUploadRecord');
  expect(picker).not.toContain('classifyUploadState');
  expect(picker).not.toContain('UploadHistoryRecord');
  expect(picker).not.toContain('p.history');
  expect(picker).toContain('p.jobs.slice(0,limit)');
  expect(picker).toContain('useState(24)');
 });
 it('cold Publisher mounts production advanced shell without a light-controller gate',()=>{
  const p=read('PublisherOS.tsx');
  expect(p).toContain('function PublisherOSAdvanced');
  expect(p).toContain('return <PublisherOSAdvanced initialPanel={null} initialMode="production" />;');
  expect(p).not.toContain('if(advancedPanel)return <PublisherOSAdvanced');
  expect(p).not.toContain('useApp(s=>s.uploadHistory)');
  expect(p).not.toContain('useApp(s=>s.fingerprintCache)');
  expect(p).not.toContain('useApp(s=>s.projectLifecycle)');
  expect(p).not.toContain('useApp(s=>s.settings)');
 });
 it('mount-time no-op state writes are guarded and avatars have fixed geometry',()=>{
  const picker=read('PublisherVideoPicker.tsx'),avatar=read('ChannelAvatar.tsx'),bar=read('YouTubeChannelBar.tsx'),center=read('YouTubeCenter.tsx'),css=read('styles.css');
  expect(picker).not.toContain('useEffect(()=>setLimit(24)');
  expect(picker).toContain('previousWindowKey.current===p.windowKey');
  expect(avatar).not.toContain('setSrc(primary);setFailed(false)');
  expect(avatar).not.toContain('localStorage.setItem(key,primary)');
  expect(avatar).toContain("recordYoutubeRouteEvent('ChannelAvatar','state-write:");
  expect(bar).toContain('if(next===activeIdRef.current)return');
  expect(center).toContain("recordYoutubeRouteEvent('YouTubeCenter','state-write:activeChannel')");
  expect(css).toContain('aspect-ratio:1/1;flex:0 0 38px;object-fit:cover');
 });
 it('only the top channel bar builds the channel option tree',()=>{
  const shell=read('PublisherShell.tsx'),bar=read('YouTubeChannelBar.tsx');
  expect(shell).not.toContain('<select');
  expect(shell).not.toContain('<option');
  expect(bar).toContain('visible.map(c=><option');
 });
});
