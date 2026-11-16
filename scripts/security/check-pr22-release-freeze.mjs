import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const workflowDir = new URL('../../.github/workflows/', import.meta.url);
const excluded = new Set([
  'vyron-pr22-release-freeze-apply.yml',
  'vyron-pr22-release-freeze-gate.yml'
]);

function parseJobs(source) {
  const lines = source.split('\n');
  const jobsIndex = lines.findIndex(line => line === 'jobs:');
  if (jobsIndex < 0) return [];
  const headers = [];
  for (let i = jobsIndex + 1; i < lines.length; i++) {
    const match = /^  ([A-Za-z0-9_-]+):\s*$/.exec(lines[i]);
    if (match) headers.push({ name: match[1], index: i });
  }
  return headers.map((header, i) => ({
    ...header,
    end: headers[i + 1]?.index ?? lines.length,
    lines
  }));
}

function isFreezeTarget(filename, source, jobs) {
  const legacySigner = /secrets\.TAURI_SIGNING_PRIVATE_KEY(?:_PASSWORD)?\b/.test(source);
  const releaseToken = /secrets\.VYRON_RELEASES_TOKEN\b/.test(source);
  const publisherJob = jobs.some(job =>
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

const filenames = readdirSync(workflowDir).filter(name => /\.ya?ml$/.test(name));
const targets = filenames.filter(filename => {
  if (excluded.has(filename)) return false;
  const source = readFileSync(new URL(filename, workflowDir), 'utf8');
  return isFreezeTarget(filename, source, parseJobs(source));
});

test('all PR #22 legacy signer and publisher workflows are frozen', () => {
  assert.ok(targets.length >= 25, `Expected broad freeze coverage; found only ${targets.length} targets`);
  const offenders = [];
  for (const filename of targets) {
    const source = readFileSync(new URL(filename, workflowDir), 'utf8');
    const jobs = parseJobs(source);
    if (!jobs.length) {
      offenders.push(`${filename}: no jobs block`);
      continue;
    }
    for (const job of jobs) {
      const block = job.lines.slice(job.index + 1, job.end);
      const condition = block.find(line => /^    if:\s*/.test(line));
      if (!condition || condition.trim() !== 'if: ${{ false }}') {
        offenders.push(`${filename}:${job.name}`);
      }
    }
    const header = source.split(/^jobs:\s*$/m)[0];
    if (/^  contents: write\s*$/m.test(header) || /^  actions: write\s*$/m.test(header)) {
      offenders.push(`${filename}: workflow write permission remains`);
    }
  }
  assert.deepEqual(offenders, [], 'Active legacy release/signing paths remain');
});

test('read-only release authorization preflight is preserved', () => {
  const source = readFileSync(new URL('vyron-330-stable-release.yml', workflowDir), 'utf8');
  const jobs = parseJobs(source);
  const preflight = jobs.find(job => job.name === 'auth-preflight');
  assert.ok(preflight, 'read-only authorization preflight missing');
  const block = preflight.lines.slice(preflight.index + 1, preflight.end);
  assert.ok(!block.some(line => /^    if:\s*\$\{\{\s*false\s*\}\}/.test(line)));
});

test('non-publishing publisher-integrity QA remains enabled', () => {
  const source = readFileSync(new URL('vyron-618-publisher-integrity-qa.yml', workflowDir), 'utf8');
  const jobs = parseJobs(source);
  assert.ok(jobs.some(job => job.name === 'qa'));
  assert.ok(!jobs.some(job => job.lines.slice(job.index + 1, job.end).some(line => /^    if:\s*\$\{\{\s*false\s*\}\}/.test(line))));
});
