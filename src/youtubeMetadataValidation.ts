export const YOUTUBE_TAG_EFFECTIVE_LIMIT = 500;

export type YoutubeTagNormalizationOptions = {
  stripLeadingHash?: boolean;
};

export type YoutubeTagSanitizeResult = {
  tags: string[];
  beforeCount: number;
  afterCount: number;
  beforeEffectiveLength: number;
  afterEffectiveLength: number;
  changed: boolean;
};

function tagText(value: unknown) {
  return String(value ?? '').trim();
}

export function normalizeYoutubeTags(values: unknown, options: YoutubeTagNormalizationOptions = {}) {
  const input = Array.isArray(values) ? values : [values];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of input) {
    let tag = tagText(value);
    if (options.stripLeadingHash) tag = tag.replace(/^#/, '').trim();
    if (!tag || seen.has(tag)) continue;
    seen.add(tag);
    out.push(tag);
  }
  return out;
}

export function youtubeTagsEffectiveLength(values: unknown) {
  const tags = normalizeYoutubeTags(values);
  if (!tags.length) return 0;
  const characters = tags.reduce((sum, tag) => sum + tag.length + (/\s/u.test(tag) ? 2 : 0), 0);
  return characters + Math.max(0, tags.length - 1);
}

function truncateSingleTag(tag: string) {
  const chars = Array.from(tag);
  while (chars.length && youtubeTagsEffectiveLength([chars.join('')]) > YOUTUBE_TAG_EFFECTIVE_LIMIT) chars.pop();
  return chars.join('').trim();
}

export function sanitizeYoutubeTags(values: unknown): YoutubeTagSanitizeResult {
  const normalized = normalizeYoutubeTags(values);
  const beforeEffectiveLength = youtubeTagsEffectiveLength(normalized);
  const beforeCount = normalized.length;
  const tags = [...normalized];

  while (tags.length > 1 && youtubeTagsEffectiveLength(tags) > YOUTUBE_TAG_EFFECTIVE_LIMIT) tags.pop();

  if (tags.length === 1 && youtubeTagsEffectiveLength(tags) > YOUTUBE_TAG_EFFECTIVE_LIMIT) {
    const truncated = truncateSingleTag(tags[0]);
    if (truncated) tags[0] = truncated;
    else tags.length = 0;
  }

  const afterEffectiveLength = youtubeTagsEffectiveLength(tags);
  return {
    tags,
    beforeCount,
    afterCount: tags.length,
    beforeEffectiveLength,
    afterEffectiveLength,
    changed:
      beforeEffectiveLength !== afterEffectiveLength ||
      beforeCount !== tags.length ||
      normalized.some((tag, index) => tag !== tags[index]),
  };
}

export function validateYoutubeTags(values: unknown) {
  const tags = normalizeYoutubeTags(values);
  const effectiveLength = youtubeTagsEffectiveLength(tags);
  return {
    valid: effectiveLength <= YOUTUBE_TAG_EFFECTIVE_LIMIT,
    tags,
    effectiveLength,
    limit: YOUTUBE_TAG_EFFECTIVE_LIMIT,
  };
}

const RETRYABLE_METADATA_CODES = [
  'invalidTags',
  'invalidTitle',
  'invalidDescription',
  'invalidPublishAt',
  'invalidCategoryId',
  'invalidVideoMetadata',
] as const;

export type RetryableYoutubeMetadataCode = (typeof RETRYABLE_METADATA_CODES)[number];

export function youtubeMetadataErrorCode(error: unknown): RetryableYoutubeMetadataCode | undefined {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const lower = raw.toLowerCase();
  for (const code of RETRYABLE_METADATA_CODES) {
    if (lower.includes(code.toLowerCase())) return code;
  }
  if (lower.includes('invalid video keywords')) return 'invalidTags';
  return undefined;
}

export function isRetryableYoutubeMetadataError(error: unknown) {
  return Boolean(youtubeMetadataErrorCode(error));
}

export function retryableYoutubeMetadataState(error: unknown, acceptedVideoId?: string) {
  const code = acceptedVideoId ? undefined : youtubeMetadataErrorCode(error);
  return code
    ? { code, status: 'READY_UPLOAD' as const, storageLifecycle: 'NEW' as const, uploadProgress: 0 }
    : undefined;
}
