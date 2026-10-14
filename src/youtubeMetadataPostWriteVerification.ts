export type MetadataVerificationPatch = {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  publishAt?: string;
  privacyStatus?: string;
};

export type MetadataVerificationActual = {
  title?: string;
  description?: string;
  tags?: string[];
  categoryId?: string;
  publishAt?: string | null;
  privacyStatus?: string;
};

export type MetadataUpdateVerificationResult = {
  id: string;
  verified: boolean;
  metadataAccepted?: boolean;
  metadataVerified: boolean;
  metadataVerifyPending?: boolean;
  scheduleRequested: boolean;
  scheduleAccepted?: boolean;
  scheduleVerified: boolean;
  scheduleVerifyPending?: boolean;
  scheduleError?: string | null;
  verificationError?: string | null;
  mismatches?: string[];
  skipped?: boolean;
  appliedTags?: number;
  actual?: MetadataVerificationActual;
};

export type YoutubeUpdateExecutor = (
  profileId: string,
  videoId: string,
  patch: MetadataVerificationPatch,
  operationId?: string,
) => Promise<MetadataUpdateVerificationResult>;

type MetadataField = 'title' | 'description' | 'tags' | 'categoryId';

const METADATA_FIELDS = new Set<MetadataField>(['title', 'description', 'tags', 'categoryId']);

function normalizeUnicode(value: unknown): string {
  return String(value ?? '').normalize('NFC');
}

function normalizeLineEndings(value: unknown): string {
  return normalizeUnicode(value).replace(/\r\n?/gu, '\n');
}

export function normalizeMetadataTitleForVerification(value: unknown): string {
  return normalizeLineEndings(value).replace(/\n+$/gu, '');
}

export function normalizeMetadataDescriptionForVerification(value: unknown): string {
  return normalizeLineEndings(value).replace(/\n+$/gu, '');
}

export function normalizeMetadataTagsForVerification(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : [];
  const unique = new Set<string>();
  for (const item of raw) {
    const tag = normalizeUnicode(item).trim();
    if (tag) unique.add(tag);
  }
  return [...unique].sort((a, b) => a.localeCompare(b, 'en'));
}

function sameTags(expected: unknown, actual: unknown): boolean {
  const left = normalizeMetadataTagsForVerification(expected);
  const right = normalizeMetadataTagsForVerification(actual);
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

export function semanticMetadataMismatches(
  patch: MetadataVerificationPatch,
  actual: MetadataVerificationActual,
): MetadataField[] {
  const mismatches: MetadataField[] = [];
  if (
    patch.title !== undefined &&
    normalizeMetadataTitleForVerification(patch.title) !== normalizeMetadataTitleForVerification(actual.title)
  ) {
    mismatches.push('title');
  }
  if (
    patch.description !== undefined &&
    normalizeMetadataDescriptionForVerification(patch.description) !==
      normalizeMetadataDescriptionForVerification(actual.description)
  ) {
    mismatches.push('description');
  }
  if (patch.tags !== undefined && !sameTags(patch.tags, actual.tags)) {
    mismatches.push('tags');
  }
  if (
    patch.categoryId !== undefined &&
    normalizeUnicode(patch.categoryId).trim() !== normalizeUnicode(actual.categoryId).trim()
  ) {
    mismatches.push('categoryId');
  }
  return mismatches;
}

function stableTextHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function firstDifference(expected: string, actual: string) {
  const limit = Math.min(expected.length, actual.length);
  let index = 0;
  while (index < limit && expected[index] === actual[index]) index += 1;
  if (index === expected.length && index === actual.length) return undefined;
  const start = Math.max(0, index - 24);
  const endExpected = Math.min(expected.length, index + 24);
  const endActual = Math.min(actual.length, index + 24);
  return {
    index,
    expectedRegion: expected.slice(start, endExpected),
    actualRegion: actual.slice(start, endActual),
  };
}

function logRealMismatch(
  videoId: string,
  patch: MetadataVerificationPatch,
  actual: MetadataVerificationActual,
  mismatches: MetadataField[],
) {
  const diagnostic: Record<string, unknown> = { videoId, fields: mismatches };
  if (mismatches.includes('title')) {
    diagnostic.title = {
      expectedNormalized: normalizeMetadataTitleForVerification(patch.title),
      actualNormalized: normalizeMetadataTitleForVerification(actual.title),
    };
  }
  if (mismatches.includes('description')) {
    const expected = normalizeMetadataDescriptionForVerification(patch.description);
    const got = normalizeMetadataDescriptionForVerification(actual.description);
    diagnostic.description = {
      expectedHash: stableTextHash(expected),
      expectedLength: expected.length,
      actualHash: stableTextHash(got),
      actualLength: got.length,
      firstDifference: firstDifference(expected, got),
    };
  }
  if (mismatches.includes('tags')) {
    const expected = normalizeMetadataTagsForVerification(patch.tags);
    const got = normalizeMetadataTagsForVerification(actual.tags);
    const expectedSet = new Set(expected);
    const actualSet = new Set(got);
    diagnostic.tags = {
      expected,
      actual: got,
      missing: expected.filter((tag) => !actualSet.has(tag)),
      extra: got.filter((tag) => !expectedSet.has(tag)),
    };
  }
  if (mismatches.includes('categoryId')) {
    diagnostic.categoryId = {
      expected: normalizeUnicode(patch.categoryId).trim(),
      actual: normalizeUnicode(actual.categoryId).trim(),
    };
  }
  console.warn('[VYRON][Metadata] post-write verification mismatch', diagnostic);
}

export function reconcileMetadataPostWriteVerification<T extends MetadataUpdateVerificationResult>(
  videoId: string,
  patch: MetadataVerificationPatch,
  result: T,
): T {
  if (result.metadataAccepted === false || result.metadataVerified || !result.actual) return result;

  const semanticMismatches = semanticMetadataMismatches(patch, result.actual);
  const nonMetadataMismatches = (result.mismatches ?? []).filter(
    (field) => !METADATA_FIELDS.has(field as MetadataField),
  );

  if (semanticMismatches.length === 0) {
    const verified = result.scheduleVerified !== false;
    return {
      ...result,
      metadataVerified: true,
      verified,
      mismatches: nonMetadataMismatches,
      verificationError: verified ? null : result.scheduleError ?? result.verificationError ?? null,
    };
  }

  logRealMismatch(videoId, patch, result.actual, semanticMismatches);
  const mismatches = [...semanticMismatches, ...nonMetadataMismatches];
  return {
    ...result,
    metadataVerified: false,
    verified: false,
    mismatches,
    verificationError: `Verification mismatch: ${semanticMismatches.join(', ')}`,
  };
}

export async function runMetadataUpdateWithSemanticVerification(
  execute: YoutubeUpdateExecutor,
  profileId: string,
  videoId: string,
  patch: MetadataVerificationPatch,
  operationId?: string,
): Promise<MetadataUpdateVerificationResult> {
  // Quota contract: exactly one backend mutation call. Verification below is purely local/read-only.
  const result = await execute(profileId, videoId, patch, operationId);
  return reconcileMetadataPostWriteVerification(videoId, patch, result);
}
