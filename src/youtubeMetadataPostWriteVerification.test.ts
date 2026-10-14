import { describe, expect, it, vi } from 'vitest';
import {
  reconcileMetadataPostWriteVerification,
  runMetadataUpdateWithSemanticVerification,
  semanticMetadataMismatches,
  type MetadataUpdateVerificationResult,
} from './youtubeMetadataPostWriteVerification';

function failedVerification(actual: MetadataUpdateVerificationResult['actual'], mismatches: string[]) {
  return {
    id: 'video-1',
    verified: false,
    metadataAccepted: true,
    metadataVerified: false,
    scheduleRequested: false,
    scheduleAccepted: true,
    scheduleVerified: true,
    verificationError: `YouTube returned different values: ${mismatches.join(', ')}`,
    mismatches,
    actual,
  } satisfies MetadataUpdateVerificationResult;
}

describe('VYRON 6.1.11 metadata post-write semantic verification', () => {
  it('TEST 1 — exact title -> PASS', () => {
    expect(semanticMetadataMismatches({ title: 'Rainy Cafe Jazz' }, { title: 'Rainy Cafe Jazz' })).toEqual([]);
  });

  it('TEST 2 — CRLF vs LF description -> PASS', () => {
    expect(semanticMetadataMismatches({ description: 'line1\r\nline2' }, { description: 'line1\nline2' })).toEqual([]);
  });

  it('TEST 3 — harmless final newline -> PASS', () => {
    expect(semanticMetadataMismatches({ description: 'line1\nline2\n' }, { description: 'line1\nline2' })).toEqual([]);
  });

  it('TEST 4 — Unicode NFC equivalence -> PASS', () => {
    expect(semanticMetadataMismatches({ title: 'Cafe\u0301' }, { title: 'Café' })).toEqual([]);
  });

  it('TEST 5 — reordered tags -> PASS', () => {
    expect(
      semanticMetadataMismatches(
        { tags: ['jazz', 'coffee', 'study'] },
        { tags: ['study', 'jazz', 'coffee'] },
      ),
    ).toEqual([]);
  });

  it('TEST 6 — whitespace-normalized tags -> PASS', () => {
    expect(
      semanticMetadataMismatches(
        { tags: [' jazz ', 'coffee ', ' study'] },
        { tags: ['jazz', 'coffee', 'study'] },
      ),
    ).toEqual([]);
  });

  it('TEST 7 — duplicate-tag canonicalization -> PASS', () => {
    expect(
      semanticMetadataMismatches(
        { tags: ['jazz', 'coffee', 'jazz', 'study'] },
        { tags: ['study', 'jazz', 'coffee'] },
      ),
    ).toEqual([]);
  });

  it('TEST 8 — genuinely missing tag -> FAIL', () => {
    expect(
      semanticMetadataMismatches(
        { tags: ['jazz', 'coffee', 'study'] },
        { tags: ['jazz', 'coffee'] },
      ),
    ).toEqual(['tags']);
  });

  it('TEST 9 — genuinely extra tag -> FAIL', () => {
    expect(
      semanticMetadataMismatches(
        { tags: ['jazz', 'coffee'] },
        { tags: ['jazz', 'coffee', 'study'] },
      ),
    ).toEqual(['tags']);
  });

  it('TEST 10 — genuinely different title -> FAIL', () => {
    expect(
      semanticMetadataMismatches(
        { title: 'Rainy Cafe Jazz' },
        { title: 'Morning Cafe Jazz' },
      ),
    ).toEqual(['title']);
  });

  it('verifies only metadata fields present in the requested patch', () => {
    const result = reconcileMetadataPostWriteVerification(
      'video-1',
      { tags: ['jazz', 'coffee'] },
      failedVerification(
        { title: 'YouTube-normalized old title', description: 'changed old description', tags: ['coffee', 'jazz'] },
        ['title', 'description', 'tags'],
      ),
    );
    expect(result.metadataVerified).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.mismatches).toEqual([]);
    expect(result.verificationError).toBeNull();
  });

  it('TEST 12 — harmless verification difference: update executor call count === 1', async () => {
    const execute = vi.fn(async () =>
      failedVerification(
        { description: 'line1\nline2', tags: ['study', 'jazz', 'coffee'] },
        ['description', 'tags'],
      ),
    );
    const result = await runMetadataUpdateWithSemanticVerification(
      execute,
      'profile-1',
      'video-1',
      { description: 'line1\r\nline2\n', tags: ['jazz', 'coffee', 'study'] },
      'apply-1',
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.metadataVerified).toBe(true);
  });

  it('TEST 13 — real verification mismatch: update executor call count === 1', async () => {
    const execute = vi.fn(async () => failedVerification({ tags: ['jazz', 'coffee'] }, ['tags']));
    const result = await runMetadataUpdateWithSemanticVerification(
      execute,
      'profile-1',
      'video-1',
      { tags: ['jazz', 'coffee', 'study'] },
      'apply-1',
    );
    expect(execute).toHaveBeenCalledTimes(1);
    expect(result.metadataVerified).toBe(false);
    expect(result.verificationError).toBe('Verification mismatch: tags');
  });

  it('TEST 11 — API exception -> FAIL with original API error', async () => {
    const execute = vi.fn(async () => {
      throw new Error('quotaExceeded: YouTube API error');
    });
    await expect(
      runMetadataUpdateWithSemanticVerification(
        execute,
        'profile-1',
        'video-1',
        { title: 'Rainy Cafe Jazz' },
        'apply-1',
      ),
    ).rejects.toThrow('quotaExceeded: YouTube API error');
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
