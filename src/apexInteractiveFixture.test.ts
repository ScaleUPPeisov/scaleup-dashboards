import {describe,it,expect} from 'vitest';
import {createApexFixture,fixtureIpc} from './apexInteractiveFixture';
describe('APEX browser-only fixture boundary',()=>{
 it('provides deterministic synthetic 33-channel fleet and 396 jobs',()=>{
  const fixture=createApexFixture(0);
  expect(fixture.channels).toHaveLength(33);expect(fixture.jobs).toHaveLength(396);
  expect(new Set(fixture.channels.map(c=>c.youtubeChannelId)).size).toBe(33);
  expect(fixture.jobs.every(j=>j.finalPath?.startsWith('/APEX_FIXTURE_ONLY/'))).toBe(true);
 });
 it('denies native mutations, real file reads and unknown commands',()=>{
  const fixture=createApexFixture(0);
  for(const command of ['save_state','load_state_in_background','youtube_upload','youtube_file_fingerprint','local_source_status','youtube_list_existing_videos','youtube_oauth_recover_existing_profiles','plugin:opener|open_url','plugin:dialog|open','plugin:updater|check','production_build','unknown'])expect(()=>fixtureIpc(command,fixture)).toThrow('APEX_FIXTURE_BLOCKED');
  expect(fixtureIpc('youtube_oauth_profiles',fixture)).toHaveLength(33);
 });
});
