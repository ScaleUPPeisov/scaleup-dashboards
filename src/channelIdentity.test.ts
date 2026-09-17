import {describe,expect,it} from 'vitest';
import type {Channel} from './types';
import {findFutureChannelMatch,hasChannelNameConflict,isFutureChannel,normalizeChannelName} from './channelIdentity';

const ch=(id:string,name:string,extra:Partial<Channel>={}):Channel=>({id,name,...extra} as Channel);

describe('future channel identity',()=>{
 it('normalizes unicode, case and whitespace without fuzzy punctuation matching',()=>{
  expect(normalizeChannelName('  ＮＥＯＮ   Rain  ')).toBe('neon rain');
  expect(normalizeChannelName('NEON-Rain')).not.toBe(normalizeChannelName('NEON Rain'));
 });
 it('treats only completely unbound channels as future channels',()=>{
  expect(isFutureChannel(ch('a','A'))).toBe(true);
  expect(isFutureChannel(ch('b','B',{youtubeChannelId:'UC123'}))).toBe(false);
  expect(isFutureChannel(ch('c','C',{youtubeProfileId:'profile'}))).toBe(false);
 });
 it('finds one exact normalized future-channel name',()=>{
  const rows=[ch('draft','Neon Rain'),ch('other','Other')];
  expect(findFutureChannelMatch(rows,'  NEON   RAIN ')?.id).toBe('draft');
 });
 it('never silently merges an ambiguous duplicate name',()=>{
  const rows=[ch('a','Neon Rain'),ch('b',' neon   rain ')];
  expect(findFutureChannelMatch(rows,'NEON RAIN')).toBeUndefined();
 });
 it('does not steal an already linked channel during name matching',()=>{
  const rows=[ch('linked','Neon Rain',{youtubeChannelId:'UC1',youtubeProfileId:'p1'}),ch('draft','Other')];
  expect(findFutureChannelMatch(rows,'Neon Rain')).toBeUndefined();
 });
 it('detects duplicate local names before a future channel is created',()=>{
  const rows=[ch('a','Neon Rain')];
  expect(hasChannelNameConflict(rows,' NEON   RAIN ')).toBe(true);
  expect(hasChannelNameConflict(rows,'Other')).toBe(false);
 });
});
