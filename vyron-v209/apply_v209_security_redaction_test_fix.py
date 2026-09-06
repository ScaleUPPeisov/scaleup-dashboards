#!/usr/bin/env python3
from pathlib import Path
import sys
ROOT=Path(sys.argv[1] if len(sys.argv)>1 else '.')
p=ROOT/'src/securityRedaction.test.ts'
p.write_text(r'''import {describe,expect,it} from 'vitest';import {redactSensitive} from './securityRedaction';
describe('security redaction',()=>{
 it('redacts bearer/oauth/google/openai secret values',()=>{
  const bearer='abc.def';const access='access-value-123';const refresh='refresh-value-456';const client='client-value-789';const google='AIza123456789012345678901234';const openai='sk-1234567890abcdefghijkl';
  const s=redactSensitive(`Bearer ${bearer} access_token=${access} refresh_token=${refresh} client_secret=${client} ${google} ${openai}`);
  for(const value of [bearer,access,refresh,client,google,openai])expect(s).not.toContain(value);
  expect(s.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(6);
  expect(s).toContain('access_token=[REDACTED]');expect(s).toContain('refresh_token=[REDACTED]');expect(s).toContain('client_secret=[REDACTED]');
 });
 it('leaves ordinary diagnostics readable',()=>{expect(redactSensitive('Downloads: 40 images, ENDLUME ready')).toBe('Downloads: 40 images, ENDLUME ready')});
});
''')
print('VYRON 2.0.9 security redaction test corrected')
