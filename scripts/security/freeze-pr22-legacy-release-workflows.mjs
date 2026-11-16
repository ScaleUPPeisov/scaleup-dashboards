import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

const directory = new URL('../../.github/workflows/', import.meta.url);
const excluded = new Set([
  'vyron-pr22-release-freeze-apply.yml',
  'vyron-pr22-release-freeze-gate.yml'
]);

function parseJobHeaders(lines) {
  const jobsIndex = lines.findIndex(line => line === 'jobs:');
  if (jobsIndex < 0) return { jobsIndex, headers: [] };
  const headers = [];
  for (let i = jobsIndex + 1; i < lines.length; i++) {
    const match = /^  ([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (match) headers.push({ name: match[1], index: i });
  }
  return { jobsIndex, headers };
}

function isFreezeTarget(filename, source, headers) {
  const legacySigner = /secrets\.TAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?\b/.test(source);
  const releaseToken = /secrets\.VYRON_RELEASES_TOKEN\b/.test(source);
  const publisherJob = headers.some(job =>
    /(release|publish|promot|candidate|rc|stable|release-assets|manifests|final-remote|macos-signed|windows-signed|build-windows)/i.test(job.name)
  );
  const dispatchesPublisher = /gh\s+workflow\s+run\s+[^\n]*(?:release|promot|publish|candidate|rc)/i.test(source);
  const releaseWrite = /gh\s+release\s+(?:create|upload|edit)|gh\s+api\s+(?:--method\s+)?(?:PUT|POST|PATCH)[^\n]*(?:releases|latest\.json)/i.test(source);
  const fileLooksPublisher = /(?:release|promot|publish|candidate|rc\d*|stable)/i.test(filename) &&
    !/(?:-qa\.ya?ml$|qa-)/i.test(filename);

  return legacySigner ||
    (releaseToken && (publisherJob || releaseWrite)) ||
    dispatchesPublisher ||
    (fileLooksPublisher && publisherJob);
}

const changed = [];
const files = readdirSync(directory).filter(name => /\.ya?ml$/.test(name));

for (const filename of files) {
  if (excluded.has(filename)) continue;
  const fileUrl = new URL(filename, directory);
  const original = readFileSync(fileUrl, 'utf8');
  const lines = original.split('\n');
  const { jobsIndex, headers } = parseJobHeaders(lines);
  if (!isFreezeTarget(filename, original, headers)) continue;
  if (jobsIndex < 0 || headers.length === 0) {
    throw new Error(`Refusing to freeze malformed workflow without jobs: ${filename}`);
  }

  let fileChanged = false;
  for (let i = headers.length - 1; i >= 0; i--) {
    const header = headers[i];
    const end = headers[i + 1]?.index ?? lines.length;
    let existingIf = -1;
    for (let j = header.index + 1; j < end; j++) {
      if (/^    if:\s*/.test(lines[j])) {
        existingIf = j;
        break;
      }
    }

    if (existingIf >= 0) {
      if (lines[existingIf].trim() !== 'if: ${{ false }}') {
        const wasMultiline = /^    if:\\s*[|>]/.test(lines[existingIf]);
        lines[existingIf] = '    if: ${{ false }}';
        fileChanged = true;
        if (wasMultiline) {
          let continuation = existingIf + 1;
          while (continuation < end && (/^\\s{6,}\\S/.test(lines[continuation]) || lines[continuation].trim() === '')) {
            lines.splice(continuation, 1);
          }
        }
      }
    } else {
      lines.splice(header.index + 1, 0,
        '    # SECURITY FREEZE 2026-11-16: legacy updater trust is compromised; release path disabled.',
        '    if: ${{ false }}'
      );
      fileChanged = true;
    }
  }

  // Disabled workflows need no write-capable workflow token.
  for (let i = 0; i < jobsIndex; i++) {
    if (/^  (contents|actions):\s*write\s*$/.test(lines[i])) {
      lines[i] = lines[i].replace(/write$/, 'read');
      fileChanged = true;
    }
  }

  if (fileChanged) {
    writeFileSync(fileUrl, lines.join('\n'));
    changed.push({ file: filename, jobs: headers.map(job => job.name) });
  }
}

if (changed.length < 25) {
  throw new Error(`Freeze scope unexpectedly small: only ${changed.length} workflows modified`);
}

console.log(`PR22_LEGACY_RELEASE_WORKFLOWS_FROZEN=${changed.length}`);
for (const item of changed) console.log(`FROZEN ${item.file} [${item.jobs.join(',')}]`);
