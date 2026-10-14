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
  it('TEST 1 — title exact', () => {
    expect(semanticMetadataMismatches({ title: 'Rainy Cafe Jazz' }, { title: 'Rainy Cafe Jazz' })).toEqual([]);
  });

  it('TEST 2 — description CRLF vs LF', () => {
    expect(semanticMetadataMismatches({ description: 'line1\r\nline2' }, { description: 'line1\nline2' })).toEqual([]);
  });

  it('TEST 3 — description harmless final newline', () => {
    expect(semanticMetadataMismatches({ description: 'line1\nline2\n' }, { description: 'line1\nline2' })).toEqual([]);
  });

  it('normalizes canonically equivalent Unicode', () => {
    expect(semanticMetadataMismatches({ title: 'Cafe\u0301' }, { title: 'Café' })).toEqual([]);
  });

  it('TEST 4 — tag order', () => {
    expect(
      semanticMetadataMismatches(
        { tags: ['jazz', 'coffee', 'study'] },
        { tags: ['study', 'jazz', 'coffee'] },
      ),
    ).toEqual([]);
  });

  it('handles duplicate and surrounding-whitespace representation deterministically', () => {
    expect(
      semanticMetadataMismatches(
        { tags: [' jazz ', 'coffee', 'jazz'] },
        { tags: ['coffee', 'jazz'] },
      ),
    ).toEqual([]);
  });

  it('TEST 5 — real missing tag fails', () => {
    expect(
      semanticMetadataMismatches(
        { tags: ['jazz', 'coffee', 'study'] },
        { tags: ['jazz', 'coffee'] },
      ),
    ).toEqual(['tags']);
  });

  it('TEST 6 — real title difference fails', () => {
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

  it('TEST 7 — apparent formatting mismatch never emits a second write', async () => {
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

  it('TEST 8 — real verification failure never emits a second write', async () => {
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

  it('TEST 9 — API failure propagates actual error without reclassification or retry', async () => {
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
