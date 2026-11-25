import {describe,expect,it} from 'vitest';
import {accountAccessLabel} from './accountApexStatus';

describe('account access labels',()=>{
 it('keeps blocked, wrong-channel, missing and unchecked profiles distinct from verified access',()=>{
  expect(accountAccessLabel(false,false,'KEYCHAIN_BLOCKED')).toBe('Keychain заблокирован');
  expect(accountAccessLabel(false,false,'WRONG_CHANNEL')).toBe('канал не совпадает');
  expect(accountAccessLabel(false,false,'MISSING')).toBe('нужен повторный вход');
  expect(accountAccessLabel(false,false,'NOT_CHECKED')).toBe('не проверен');
  expect(accountAccessLabel(false,true,'MISSING')).toBe('требует восстановления');
  expect(accountAccessLabel(true,false,'READY')).toBe('подтверждён');
 });
});
